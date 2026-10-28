const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const cookie = require('cookie');
const agent = require('../agent/agent');

const MAX_MESSAGE_LENGTH = 2000;


async function initSocketServer(httpServer) {

    const io = new Server(httpServer, {
        path: "/api/socket/socket.io/",
    })

    io.use((socket, next) => {

        const cookies = socket.handshake.headers?.cookie;

        const { token } = cookies ? cookie.parse(cookies) : {};

        if (!token) {
            return next(new Error('Token not provided'));
        }

        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);

            socket.user = decoded;
            socket.token = token;

            next()

        } catch (err) {
            next(new Error('Invalid token'));
        }

    })

    io.on('connection', (socket) => {

        console.log("AI Buddy socket connected for user:", socket.user.username)


        socket.on('message', async (data) => {

            if (typeof data !== 'string' || !data.trim() || data.length > MAX_MESSAGE_LENGTH) {
                socket.emit('message', `Please send a text message of at most ${MAX_MESSAGE_LENGTH} characters.`)
                return
            }

            // The token expires while a socket can stay open; stop using it once it is no longer valid
            try {
                jwt.verify(socket.token, process.env.JWT_SECRET)
            } catch (err) {
                socket.emit('message', 'Your session has expired. Please log in again.')
                socket.disconnect(true)
                return
            }

            try {
                const agentResponse = await agent.invoke({
                    messages: [
                        {
                            role: "user",
                            content: data
                        }
                    ]
                }, {
                    metadata: {
                        token: socket.token
                    }
                })

                const lastMessage = agentResponse.messages[ agentResponse.messages.length - 1 ]

                socket.emit('message', lastMessage.content)
            } catch (err) {
                console.error('AI agent error:', err.message)
                socket.emit('message', 'Sorry, the assistant could not answer right now. Please try again.')
            }

        })

    })

    return io

}


module.exports = { initSocketServer };
