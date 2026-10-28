const ImageKit = require('imagekit');
const { v4: uuidv4 } = require("uuid")
const { isMockMode } = require('../config/env');



const imagekit = new ImageKit({
    publicKey: process.env.IMAGEKIT_PUBLIC_KEY || 'test_public',
    privateKey: process.env.IMAGEKIT_PRIVATE_KEY || 'test_private',
    urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT || 'https://ik.imagekit.io/demo',
});

async function uploadImage({ buffer, mimetype = 'image/jpeg', folder = '/products' }) {
    // Mock mode without ImageKit credentials: keep the image inline as a data URL
    // so the seller flow can be tested locally. Nothing is uploaded anywhere.
    if (isMockMode() && !process.env.IMAGEKIT_PRIVATE_KEY) {
        const url = `data:${mimetype};base64,${buffer.toString('base64')}`;
        return { url, thumbnail: url, id: `mock_${uuidv4()}` };
    }

    const res = await imagekit.upload({
        file: buffer,
        fileName: uuidv4(),
        folder,
    });
    return {
        url: res.url,
        thumbnail: res.thumbnailUrl || res.url,
        id: res.fileId,
    };
}

module.exports = { imagekit, uploadImage };
