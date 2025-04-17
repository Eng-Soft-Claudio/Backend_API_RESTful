// backend/jest-environment-mongodb-config.js
export default {
    mongodbMemoryServerOptions: {
        binary: {
            version: '6.0.6',
            skipMD5: true,
        },
        autoStart: false, 
        instance: {
            dbName: 'jest',
        },
    },
};