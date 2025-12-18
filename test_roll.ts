
import pino from 'pino';
import fs from 'fs';

const transport = pino.transport({
    target: 'pino-roll',
    options: {
        file: './logs/test_roll.log',
        frequency: 'daily',
        limit: {
            count: 3
        },
        mkdir: true
    }
});

const logger = pino(transport);

logger.info('Test log entry');

setTimeout(() => {
    console.log('Files in logs/:', fs.readdirSync('./logs'));
}, 1000);
