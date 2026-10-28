// Startup configuration checks. Mock mode (USE_MOCK_DB=true) swaps MongoDB and other
// infrastructure for development-only stand-ins and is refused outside development/test.

const MOCK_ALLOWED_ENVS = [ 'development', 'test' ];
const MIN_SECRET_LENGTH = 32;

function isMockMode() {
    if (process.env.USE_MOCK_DB !== 'true') return false;

    if (!MOCK_ALLOWED_ENVS.includes(process.env.NODE_ENV)) {
        throw new Error(`USE_MOCK_DB=true is only allowed when NODE_ENV is "development" or "test" (current: "${process.env.NODE_ENV || 'unset'}")`);
    }

    return true;
}

// required: always needed. requiredUnlessMock: needed only when talking to real infrastructure.
function validateEnv({ required = [], requiredUnlessMock = [] } = {}) {
    const mock = isMockMode();

    const missing = [ ...required, ...(mock ? [] : requiredUnlessMock) ].filter(name => !process.env[ name ]);

    if (missing.length) {
        throw new Error(`Missing required environment variables: ${missing.join(', ')}. Copy .env.example to .env and fill them in${mock ? '' : ', or set USE_MOCK_DB=true with NODE_ENV=development'}.`);
    }

    if (process.env.NODE_ENV === 'production') {
        const weak = [ 'JWT_SECRET', 'INTERNAL_SERVICE_TOKEN' ]
            .filter(name => required.includes(name) && process.env[ name ].length < MIN_SECRET_LENGTH);
        if (weak.length) {
            throw new Error(`${weak.join(', ')} must be at least ${MIN_SECRET_LENGTH} characters in production.`);
        }
    }

    console.log(mock
        ? '[config] MOCK MODE: using in-memory development data (not for production)'
        : '[config] Using real infrastructure from environment');
}

module.exports = { isMockMode, validateEnv };
