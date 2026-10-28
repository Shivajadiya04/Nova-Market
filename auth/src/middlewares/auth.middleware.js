const jwt = require('jsonwebtoken');
const { isTokenRevoked } = require('../services/token.service');


async function authMiddleware(req, res, next) {
    const token = req.cookies.token;

    if (!token) {
        return res.status(401).json({ message: "Unauthorized" });
    }

    let decoded;
    try {
        decoded = jwt.verify(token, process.env.JWT_SECRET);
    }
    catch (err) {
        return res.status(401).json({ message: "Unauthorized" });
    }

    try {
        if (await isTokenRevoked(token)) {
            return res.status(401).json({ message: "Unauthorized" });
        }
    } catch (err) {
        // Fail closed: if the revocation store is down we cannot tell whether the user logged out
        console.error('Token revocation check failed:', err.message);
        return res.status(503).json({ message: "Authentication temporarily unavailable" });
    }

    req.user = decoded; // attach user info to request
    req.token = token;

    next();

}

module.exports = {
    authMiddleware
};
