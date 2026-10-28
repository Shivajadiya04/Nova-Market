// Development-only, pure-JavaScript stand-in for the MongoDB driver (used when USE_MOCK_DB=true).
//
// Mongoose is attached to it with connection.setClient(), so models, schema casting, validation,
// defaults, timestamps, `select: false`, versioning etc. run exactly as they do against MongoDB.
// Only the raw collection operations land here, in process memory: nothing is persisted and
// everything is lost when the service restarts.
//
// It implements the subset of MongoDB these services use: insert/find/update/delete, the common
// query operators ($and/$or/$nor, $eq/$ne/$in/$nin/$gt(e)/$lt(e)/$exists/$regex/$elemMatch/$size/$not),
// update operators ($set/$unset/$inc/$push/$addToSet/$pull/$pullAll/$setOnInsert), projection,
// sort/skip/limit, unique indexes and a simple word-matching $text search. Anything else throws
// "not supported by the in-memory mock database" instead of silently misbehaving.

function unsupported(what) {
    throw new Error(`${what} is not supported by the in-memory mock database`);
}

function createDriver(ObjectId) {
    const isObjectId = (v) => v instanceof ObjectId || (v != null && v._bsontype === 'ObjectId');
    const isPlainObject = (v) => v != null && typeof v === 'object' && !Array.isArray(v) && !isObjectId(v)
        && !(v instanceof Date) && !(v instanceof RegExp) && !Buffer.isBuffer(v) && !v._bsontype;
    const isOperatorObject = (v) => isPlainObject(v) && Object.keys(v).length > 0 && Object.keys(v).every(k => k.startsWith('$'));

    function clone(value) {
        if (value === null || typeof value !== 'object') return value;
        if (isObjectId(value) || value instanceof RegExp || value._bsontype) return value; // immutable
        if (value instanceof Date) return new Date(value.getTime());
        if (Buffer.isBuffer(value)) return Buffer.from(value);
        if (typeof value.toBSON === 'function') return clone(value.toBSON()); // Mongoose arrays/subdocs
        if (Array.isArray(value)) return value.map(clone);
        const out = {};
        for (const [ key, val ] of Object.entries(value)) {
            if (val !== undefined) out[ key ] = clone(val);
        }
        return out;
    }

    function equals(a, b) {
        if (isObjectId(a) || isObjectId(b)) return isObjectId(a) && isObjectId(b) && a.toHexString() === b.toHexString();
        if (a instanceof Date || b instanceof Date) return a instanceof Date && b instanceof Date && a.getTime() === b.getTime();
        if (Array.isArray(a) || Array.isArray(b)) {
            return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => equals(x, b[ i ]));
        }
        if (isPlainObject(a) && isPlainObject(b)) {
            const ka = Object.keys(a).filter(k => a[ k ] !== undefined);
            const kb = Object.keys(b).filter(k => b[ k ] !== undefined);
            return ka.length === kb.length && ka.every(k => equals(a[ k ], b[ k ]));
        }
        return a === b;
    }

    // Comparison for range operators and sorting. Returns null for incomparable types.
    function compare(a, b) {
        const norm = (v) => (v instanceof Date ? v.getTime() : isObjectId(v) ? v.toHexString() : v);
        const x = norm(a);
        const y = norm(b);
        if (x == null && y == null) return 0;
        if (x == null) return -1;
        if (y == null) return 1;
        if (typeof x !== typeof y) return null;
        return x < y ? -1 : x > y ? 1 : 0;
    }

    // All values reachable at a dotted path, descending into arrays like MongoDB does.
    function resolve(value, parts) {
        if (parts.length === 0) return [ value ];
        if (Array.isArray(value)) {
            if (/^\d+$/.test(parts[ 0 ])) return resolve(value[ Number(parts[ 0 ]) ], parts.slice(1));
            return value.flatMap(el => resolve(el, parts));
        }
        if (!isPlainObject(value)) return [ undefined ];
        return resolve(value[ parts[ 0 ] ], parts.slice(1));
    }

    function matchCondition(values, condition, ctx) {
        // a field holding an array matches if the array itself or any element matches
        const candidates = values.flatMap(v => (Array.isArray(v) ? [ v, ...v ] : [ v ]));

        if (condition instanceof RegExp) return candidates.some(c => typeof c === 'string' && condition.test(c));

        if (!isOperatorObject(condition)) {
            if (condition === null) return candidates.some(c => c == null);
            return candidates.some(c => equals(c, condition));
        }

        return Object.entries(condition).every(([ op, arg ]) => {
            switch (op) {
                case '$eq': return matchCondition(values, arg, ctx);
                case '$ne': return !matchCondition(values, arg, ctx);
                case '$in': return arg.some(x => matchCondition(values, x, ctx));
                case '$nin': return !arg.some(x => matchCondition(values, x, ctx));
                case '$gt': return candidates.some(c => c !== undefined && compare(c, arg) > 0);
                case '$gte': return candidates.some(c => c !== undefined && compare(c, arg) >= 0);
                case '$lt': return candidates.some(c => c !== undefined && compare(c, arg) < 0);
                case '$lte': return candidates.some(c => c !== undefined && compare(c, arg) <= 0);
                case '$exists': return values.some(v => v !== undefined) === Boolean(arg);
                case '$regex': {
                    const regex = arg instanceof RegExp ? arg : new RegExp(arg, condition.$options || '');
                    return candidates.some(c => typeof c === 'string' && regex.test(c));
                }
                case '$options': return true;
                case '$elemMatch':
                    return values.some(v => Array.isArray(v) && v.some(el => (isOperatorObject(arg) ? matchCondition([ el ], arg, ctx) : matches(el, arg, ctx))));
                case '$size': return values.some(v => Array.isArray(v) && v.length === arg);
                case '$not': return !matchCondition(values, arg, ctx);
                default: return unsupported(`Query operator ${op}`);
            }
        });
    }

    function matchText(doc, { $search }, ctx) {
        if (!ctx.textFields.length) {
            const err = new Error('text index required for $text query');
            err.code = 27;
            throw err;
        }
        const terms = String($search).toLowerCase().split(/\s+/).filter(Boolean);
        const text = ctx.textFields
            .flatMap(field => resolve(doc, field.split('.')))
            .filter(v => typeof v === 'string')
            .join(' ')
            .toLowerCase();
        return terms.some(term => text.includes(term));
    }

    function matches(doc, filter = {}, ctx = { textFields: [] }) {
        return Object.entries(filter).every(([ key, condition ]) => {
            switch (key) {
                case '$and': return condition.every(f => matches(doc, f, ctx));
                case '$or': return condition.some(f => matches(doc, f, ctx));
                case '$nor': return !condition.some(f => matches(doc, f, ctx));
                case '$text': return matchText(doc, condition, ctx);
                case '$comment': return true;
                default:
                    if (key.startsWith('$')) return unsupported(`Query operator ${key}`);
                    return matchCondition(resolve(doc, key.split('.')), condition, ctx);
            }
        });
    }

    function getPath(doc, path) {
        return path.split('.').reduce((value, part) => (value == null ? undefined : value[ part ]), doc);
    }

    function setPath(doc, path, value) {
        const parts = path.split('.');
        if (parts.includes('$')) unsupported(`Positional update path "${path}"`);
        let target = doc;
        parts.slice(0, -1).forEach((part, i) => {
            if (target[ part ] == null || typeof target[ part ] !== 'object') {
                target[ part ] = /^\d+$/.test(parts[ i + 1 ]) ? [] : {};
            }
            target = target[ part ];
        });
        target[ parts[ parts.length - 1 ] ] = value;
    }

    function unsetPath(doc, path) {
        const parts = path.split('.');
        const parent = parts.length === 1 ? doc : getPath(doc, parts.slice(0, -1).join('.'));
        if (parent != null && typeof parent === 'object') delete parent[ parts[ parts.length - 1 ] ];
    }

    function arrayAt(doc, path, op) {
        const current = getPath(doc, path);
        if (current === undefined) {
            setPath(doc, path, []);
            return getPath(doc, path);
        }
        if (!Array.isArray(current)) unsupported(`${op} on non-array field "${path}"`);
        return current;
    }

    const eachValues = (value) => (isPlainObject(value) && Array.isArray(value.$each) ? value.$each : [ value ]);

    function applyUpdate(doc, update, { isInsert = false } = {}) {
        if (!Object.keys(update).some(k => k.startsWith('$'))) {
            // replacement document
            const _id = doc._id;
            Object.keys(doc).forEach(k => delete doc[ k ]);
            Object.assign(doc, clone(update), { _id });
            return;
        }
        for (const [ op, fields ] of Object.entries(update)) {
            for (const [ path, value ] of Object.entries(fields || {})) {
                switch (op) {
                    case '$set': setPath(doc, path, clone(value)); break;
                    case '$setOnInsert': if (isInsert) setPath(doc, path, clone(value)); break;
                    case '$unset': unsetPath(doc, path); break;
                    case '$inc': setPath(doc, path, (getPath(doc, path) || 0) + value); break;
                    case '$push': {
                        if (isPlainObject(value) && (value.$position !== undefined || value.$slice !== undefined || value.$sort !== undefined)) {
                            unsupported('$push with $position/$slice/$sort');
                        }
                        arrayAt(doc, path, op).push(...eachValues(value).map(clone));
                        break;
                    }
                    case '$addToSet': {
                        const array = arrayAt(doc, path, op);
                        eachValues(value).forEach(v => { if (!array.some(el => equals(el, v))) array.push(clone(v)); });
                        break;
                    }
                    case '$pull': {
                        const array = arrayAt(doc, path, op);
                        const remove = (el) => (isOperatorObject(value)
                            ? matchCondition([ el ], value)
                            : isPlainObject(value) && isPlainObject(el) ? matches(el, value) : equals(el, value));
                        setPath(doc, path, array.filter(el => !remove(el)));
                        break;
                    }
                    case '$pullAll': {
                        const array = arrayAt(doc, path, op);
                        setPath(doc, path, array.filter(el => !value.some(v => equals(el, v))));
                        break;
                    }
                    default: unsupported(`Update operator ${op}`);
                }
            }
        }
    }

    function project(doc, projection) {
        const entries = Object.entries(projection || {}).filter(([ , v ]) => typeof v !== 'object');
        if (!entries.length) return doc;

        const inclusive = entries.some(([ key, v ]) => key !== '_id' && v);
        if (!inclusive) {
            entries.forEach(([ key, v ]) => { if (!v) unsetPath(doc, key); });
            return doc;
        }

        const copy = (src, dst, parts) => {
            const [ head, ...rest ] = parts;
            if (src == null || src[ head ] === undefined) return;
            if (!rest.length) {
                dst[ head ] = src[ head ];
            } else if (Array.isArray(src[ head ])) {
                dst[ head ] = src[ head ].map(el => { const o = {}; copy(el, o, rest); return o; });
            } else if (isPlainObject(src[ head ])) {
                dst[ head ] = dst[ head ] || {};
                copy(src[ head ], dst[ head ], rest);
            }
        };
        const out = {};
        if (projection._id !== 0 && projection._id !== false) out._id = doc._id;
        entries.forEach(([ key, v ]) => { if (v && key !== '_id') copy(doc, out, key.split('.')); });
        return out;
    }

    function sortDocs(docs, sort) {
        const keys = Array.isArray(sort) ? sort : Object.entries(sort || {});
        if (!keys.length) return docs;
        return [ ...docs ].sort((a, b) => {
            for (const [ key, direction ] of keys) {
                const dir = direction === -1 || direction === 'desc' || direction === 'descending' ? -1 : 1;
                const result = compare(resolve(a, key.split('.'))[ 0 ], resolve(b, key.split('.'))[ 0 ]) || 0;
                if (result) return result * dir;
            }
            return 0;
        });
    }

    const cursor = (docs) => ({
        toArray: async () => docs,
        close: async () => {},
        async* [ Symbol.asyncIterator ]() { yield* docs; },
    });

    class MemoryCollection {
        constructor(name, dbName) {
            this.collectionName = name;
            this.namespace = `${dbName}.${name}`;
            this.docs = [];
            this.indexList = [ { v: 2, key: { _id: 1 }, name: '_id_' } ];
        }

        get textFields() {
            return this.indexList.flatMap(index => Object.entries(index.key).filter(([ , type ]) => type === 'text').map(([ field ]) => field));
        }

        ctx() {
            return { textFields: this.textFields };
        }

        // `replacing` is the stored version of `doc` during an update; it is not a clash with itself.
        checkUnique(doc, others, replacing = null) {
            for (const index of this.indexList) {
                if (!index.unique && index.name !== '_id_') continue;
                const fields = Object.keys(index.key);
                const key = fields.map(f => getPath(doc, f) ?? null);
                const clash = others.find(other => other !== doc && other !== replacing
                    && fields.every((f, i) => equals(getPath(other, f) ?? null, key[ i ])));
                if (clash) {
                    const keyValue = Object.fromEntries(fields.map((f, i) => [ f, key[ i ] ]));
                    const err = new Error(`E11000 duplicate key error collection: ${this.namespace} index: ${index.name} dup key: ${JSON.stringify(keyValue)}`);
                    err.name = 'MongoServerError';
                    err.code = 11000;
                    err.keyPattern = index.key;
                    err.keyValue = keyValue;
                    throw err;
                }
            }
        }

        prepare(doc) {
            const copy = clone(doc);
            if (copy._id === undefined) copy._id = new ObjectId();
            return copy;
        }

        select(filter, options = {}) {
            let results = this.docs.filter(doc => matches(doc, filter, this.ctx()));
            results = sortDocs(results, options.sort);
            if (options.skip) results = results.slice(Number(options.skip));
            if (options.limit) results = results.slice(0, Math.abs(Number(options.limit)));
            return results;
        }

        output(doc, options = {}) {
            return doc ? project(clone(doc), options.projection) : null;
        }

        // ---------- driver API used by Mongoose ----------

        async insertOne(doc) {
            const prepared = this.prepare(doc);
            this.checkUnique(prepared, this.docs);
            this.docs.push(prepared);
            return { acknowledged: true, insertedId: prepared._id };
        }

        async insertMany(docs) {
            const prepared = docs.map(doc => this.prepare(doc));
            const all = [ ...this.docs ];
            prepared.forEach(doc => { this.checkUnique(doc, all); all.push(doc); });
            this.docs.push(...prepared);
            return {
                acknowledged: true,
                insertedCount: prepared.length,
                insertedIds: Object.fromEntries(prepared.map((doc, i) => [ i, doc._id ])),
            };
        }

        find(filter = {}, options = {}) {
            return cursor(this.select(filter, options).map(doc => this.output(doc, options)));
        }

        async findOne(filter = {}, options = {}) {
            return this.output(this.select(filter, { ...options, limit: 1 })[ 0 ], options);
        }

        async countDocuments(filter = {}, options = {}) {
            return this.select(filter, options).length;
        }

        async estimatedDocumentCount() {
            return this.docs.length;
        }

        async distinct(field, filter = {}) {
            const values = [];
            this.select(filter).forEach(doc => resolve(doc, field.split('.')).flat().forEach(v => {
                if (v !== undefined && !values.some(x => equals(x, v))) values.push(v);
            }));
            return values;
        }

        // Applies the update to a copy, checks unique indexes, then commits.
        modify(doc, update, isInsert) {
            const next = clone(doc);
            applyUpdate(next, update, { isInsert });
            this.checkUnique(next, this.docs, doc);
            return next;
        }

        upsert(filter, update) {
            const base = {};
            Object.entries(filter).forEach(([ key, value ]) => {
                if (!key.startsWith('$') && !isOperatorObject(value)) setPath(base, key, clone(value));
            });
            const doc = this.prepare(base);
            applyUpdate(doc, update, { isInsert: true });
            this.checkUnique(doc, this.docs);
            this.docs.push(doc);
            return doc;
        }

        async updateOne(filter, update, options = {}) {
            const [ doc ] = this.select(filter, { sort: options.sort, limit: 1 });
            if (!doc) {
                if (options.upsert) {
                    const created = this.upsert(filter, update);
                    return { acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedCount: 1, upsertedId: created._id };
                }
                return { acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedCount: 0, upsertedId: null };
            }
            const next = this.modify(doc, update, false);
            const modified = !equals(next, doc);
            this.docs[ this.docs.indexOf(doc) ] = next;
            return { acknowledged: true, matchedCount: 1, modifiedCount: modified ? 1 : 0, upsertedCount: 0, upsertedId: null };
        }

        async updateMany(filter, update, options = {}) {
            const targets = this.select(filter);
            if (!targets.length && options.upsert) return this.updateOne(filter, update, options);
            let modifiedCount = 0;
            targets.forEach(doc => {
                const next = this.modify(doc, update, false);
                if (!equals(next, doc)) modifiedCount++;
                this.docs[ this.docs.indexOf(doc) ] = next;
            });
            return { acknowledged: true, matchedCount: targets.length, modifiedCount, upsertedCount: 0, upsertedId: null };
        }

        async replaceOne(filter, replacement, options = {}) {
            return this.updateOne(filter, replacement, options);
        }

        withMetadata(value, options, updatedExisting) {
            return options.includeResultMetadata ? { value, ok: 1, lastErrorObject: { n: value ? 1 : 0, updatedExisting } } : value;
        }

        async findOneAndUpdate(filter, update, options = {}) {
            const returnAfter = options.returnDocument === 'after' || options.returnOriginal === false;
            const [ doc ] = this.select(filter, { sort: options.sort, limit: 1 });
            if (!doc) {
                if (!options.upsert) return this.withMetadata(null, options, false);
                const created = this.upsert(filter, update);
                return this.withMetadata(returnAfter ? this.output(created, options) : null, options, false);
            }
            const next = this.modify(doc, update, false);
            this.docs[ this.docs.indexOf(doc) ] = next;
            return this.withMetadata(this.output(returnAfter ? next : doc, options), options, true);
        }

        async findOneAndReplace(filter, replacement, options = {}) {
            return this.findOneAndUpdate(filter, replacement, options);
        }

        async findOneAndDelete(filter, options = {}) {
            const [ doc ] = this.select(filter, { sort: options.sort, limit: 1 });
            if (doc) this.docs.splice(this.docs.indexOf(doc), 1);
            return this.withMetadata(this.output(doc, options), options, false);
        }

        async deleteOne(filter = {}) {
            const [ doc ] = this.select(filter, { limit: 1 });
            if (doc) this.docs.splice(this.docs.indexOf(doc), 1);
            return { acknowledged: true, deletedCount: doc ? 1 : 0 };
        }

        async deleteMany(filter = {}) {
            const targets = new Set(this.select(filter));
            this.docs = this.docs.filter(doc => !targets.has(doc));
            return { acknowledged: true, deletedCount: targets.size };
        }

        async createIndex(key, options = {}) {
            const name = options.name || Object.entries(key).map(([ f, t ]) => `${f}_${t}`).join('_');
            if (!this.indexList.some(index => index.name === name)) {
                this.indexList.push({ v: 2, key, name, unique: Boolean(options.unique) });
            }
            return name;
        }

        async createIndexes(specs) {
            return Promise.all(specs.map(({ key, ...options }) => this.createIndex(key, options)));
        }

        listIndexes() {
            return cursor(this.indexList.map(clone));
        }

        async indexes() {
            return this.indexList.map(clone);
        }

        async dropIndex(name) {
            this.indexList = this.indexList.filter(index => index.name !== name);
        }

        async drop() {
            this.docs = [];
            return true;
        }

        aggregate() { return unsupported('aggregate()'); }

        bulkWrite() { return unsupported('bulkWrite()'); }

        watch() { return unsupported('Change streams'); }
    }

    class MemoryDb {
        constructor(name) {
            this.databaseName = name;
            this.collectionMap = new Map();
        }

        collection(name) {
            if (!this.collectionMap.has(name)) this.collectionMap.set(name, new MemoryCollection(name, this.databaseName));
            return this.collectionMap.get(name);
        }

        async collections() {
            return [ ...this.collectionMap.values() ];
        }

        async createCollection(name) {
            return this.collection(name);
        }

        listCollections() {
            return cursor([ ...this.collectionMap.keys() ].map(name => ({ name, type: 'collection' })));
        }

        async dropCollection(name) {
            return this.collectionMap.delete(name);
        }

        async dropDatabase() {
            this.collectionMap.forEach(collection => { collection.docs = []; });
            return true;
        }
    }

    return { MemoryDb, matches };
}

// Connects the given mongoose instance to a fresh in-memory database.
async function connectInMemory(mongoose, dbName) {
    const { MongoClient, ObjectId } = mongoose.mongo;
    const { MemoryDb } = createDriver(ObjectId);
    const db = new MemoryDb(dbName);

    // setClient() requires a MongoClient instance; this one only provides what Mongoose reads.
    const client = Object.create(MongoClient.prototype);
    const define = (name, value) => Object.defineProperty(client, name, { value, writable: true, configurable: true });
    define('topology', { description: { type: 'InMemoryMock' } });
    define('s', { url: `memory://${dbName}`, options: { dbName, hosts: [ { host: 'memory', port: 0 } ] } });
    define('db', () => db);
    define('on', () => client);
    define('close', async () => {});

    mongoose.connection.setClient(client);
    await Promise.all(Object.values(mongoose.connection.models).map(model => model.init()));
    return db;
}

module.exports = { connectInMemory, createDriver };
