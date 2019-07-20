const express = require('express');
const app = express();
const server = require('http').createServer(app);
const io = require('socket.io').listen(server);
const cors = require('cors');
const bodyParser = require('body-parser');

const sessions = new Map();
const connections = new Map();

app.use(cors());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

app.get('/', (_, res) => {
    res.send('Server Online!');
});

app.post('/wake', (req, res) => {
    if (!req.body || !req.body.identifier) {
        res.send('ERROR_BAD_PARAMS');
    } else {
        res.send(req.body.identifier.toString());
    }
});

app.post('/session', async (req, res) => {
    await sleep(1000);

    if (!req.body || !req.body.id) {
        res.send('ERROR_BAD_PARAMS');
    } else if (sessions.has(req.body.id)) {
        res.send('VALID');
    } else {
        res.send('INVALID');
    }
});

const emitToServer = (socketID, name, ...args) => {
    const info = connections.get(socketID);

    if (info && info.server) {
        io.to(info.server).emit(name, ...args);
    }
};

const sleep = (time) => {
    return new Promise(resolve => {
        setTimeout(resolve, time);
    });
};

io.on('connection', (socket) => {
    connections.set(socket.id, null);

    socket.on('createSession', (id, callback) => {
        if (!sessions.get(id) && !connections.get(socket.id)) {
            const info = {
                key: id,
                server: socket.id,
                client: null
            };

            sessions.set(id, info);
            connections.set(socket.id, info);

            callback(true);
        } else {
            callback(false);
        }
    });

    socket.on('closeSession', (callback) => {
        const info = connections.get(socket.id);

        if (info && info.client == socket.id && info.server) {
            io.to(info.server).emit('userLeft');

            info.client = null;
        }

        connections.set(socket.id, null);

        callback();
    });

    socket.on('joinSession', (id, passcode, callback) => {
        const info = sessions.get(id);

        if (info && !info.client && !connections.get(socket.id)) {
            if (!io.sockets.connected[info.server]) {
                callback(false);

                return;
            }

            io.sockets.connected[info.server].emit('userJoined', passcode, (success, ratio, size) => {
                if (success) {
                    info.client = socket.id;

                    connections.set(socket.id, info);

                    callback(true, ratio, size);
                } else {
                    callback(false);
                }
            });
        } else {
            callback(false);
        }
    });

    socket.on('file', (data, fileName) => {
        const info = connections.get(socket.id);

        if (info && info.client && info.client !== socket.id) {
            const target = io.sockets.connected[info.client];

            if (target) {
                target.emit('file', data, fileName);
            }
        }
    });

    socket.on('keyBoardEvent', (keys) => emitToServer(socket.id, 'keyBoardEvent', keys));

    socket.on('mouseLeftDown', (position) => emitToServer(socket.id, 'mouseLeftDown', position));

    socket.on('mouseLeftUp', (position) => emitToServer(socket.id, 'mouseLeftUp', position));

    socket.on('mouseRightDown', (position) => emitToServer(socket.id, 'mouseRightDown', position));

    socket.on('mouseRightUp', (position) => emitToServer(socket.id, 'mouseRightUp', position));

    socket.on('screenShot', (blob) => {
        const info = connections.get(socket.id);

        if (info && info.client && info.client !== socket.id) {
            const target = io.sockets.connected[info.client];
            
            if (target) {
                target.emit('screenShot', blob);
            }
        }
    });

    socket.on('disconnect', () => {
        const info = connections.get(socket.id);

        if (info) {
            if (info.server == socket.id) {
                if (info.client) {
                    io.to(info.client).emit('serverClosed');

                    connections.set(info.client, null);
                }

                sessions.delete(info.key);
            } else if (info.client == socket.id && info.server) {
                io.to(info.server).emit('userLeft');

                info.client = null;
            }
        }

        connections.delete(socket.id);
    });
});

server.listen(5000, () => {
    console.log('Server Started on Port 5000');
});