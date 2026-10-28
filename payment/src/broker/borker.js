const amqplib = require('amqplib');
const { isMockMode } = require('../config/env');



let channel, connection, connecting;
const subscriptions = [];
const RECONNECT_DELAY_MS = 5000;


// In mock mode without RABBIT_URL there is no broker: events are logged and dropped
// so requests that publish (register, create product, ...) still succeed locally.
function isBrokerDisabled() {
    return isMockMode() && !process.env.RABBIT_URL;
}


function scheduleReconnect() {
    setTimeout(() => {
        connect().catch(() => {});
    }, RECONNECT_DELAY_MS).unref();
}


async function consume(ch, queueName, callback) {
    await ch.assertQueue(queueName, {
        durable: true
    });

    ch.consume(queueName, async (msg) => {
        if (msg === null) return;
        try {
            const data = JSON.parse(msg.content.toString());
            await callback(data);
            ch.ack(msg);
        } catch (error) {
            // Not requeued: a message that always fails would otherwise loop forever
            console.error(`Failed to process message from ${queueName}:`, error.message);
            ch.nack(msg, false, false);
        }
    })
}


async function connect() {

    if (connection) return connection;

    if (isBrokerDisabled()) {
        console.log('[mock-broker] RABBIT_URL not set in mock mode; events will be logged, not delivered');
        return;
    }

    if (connecting) return connecting;

    connecting = (async () => {
        try {
            const conn = await amqplib.connect(process.env.RABBIT_URL);
            const ch = await conn.createChannel();

            conn.on('error', (error) => console.error('RabbitMQ connection error:', error.message));
            conn.on('close', () => {
                console.error(`RabbitMQ connection closed; reconnecting in ${RECONNECT_DELAY_MS / 1000}s`);
                connection = channel = undefined;
                scheduleReconnect();
            });

            // Attach every registered consumer (again, after a reconnect) before exposing the channel
            for (const { queueName, callback } of subscriptions) {
                await consume(ch, queueName, callback);
            }
            connection = conn;
            channel = ch;
            console.log('Connected to RabbitMQ');
            return connection;
        }
        catch (error) {
            console.error('Error connecting to RabbitMQ:', error.message);
            connection = channel = undefined;
            scheduleReconnect();
        }
        finally {
            connecting = undefined;
        }
    })();

    return connecting;
}


// Best effort: the data the event describes is already saved, so a broker outage is logged
// instead of failing the user's request. Payloads are not logged because they contain user data.
async function publishToQueue(queueName, data = {}) {
    if (isBrokerDisabled()) {
        console.log('[mock-broker] skipped publish to', queueName);
        return false;
    }

    try {
        if (!channel || !connection) await connect();
        if (!channel) throw new Error('not connected');

        await channel.assertQueue(queueName, {
            durable: true
        });

        channel.sendToQueue(queueName, Buffer.from(JSON.stringify(data)), { persistent: true });
        console.log('Message sent to queue:', queueName);
        return true;
    } catch (error) {
        console.error(`Could not publish to ${queueName}:`, error.message);
        return false;
    }
}


async function subscribeToQueue(queueName, callback) {

    if (isBrokerDisabled()) {
        console.log('[mock-broker] not subscribing to', queueName);
        return;
    }

    subscriptions.push({ queueName, callback });

    if (channel) {
        await consume(channel, queueName, callback);
        return;
    }

    // connect() attaches every registered consumer once the connection is up (now or on retry)
    await connect();

}


async function close() {
    subscriptions.length = 0;
    if (connection) {
        const current = connection;
        connection = channel = undefined;
        current.removeAllListeners('close');
        await current.close().catch(() => {});
    }
}





module.exports = {
    connect,
    close,
    publishToQueue,
    subscribeToQueue
}

