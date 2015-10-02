var express = require("express");
var bodyParser = require("body-parser");
var cookieParser = require("cookie-parser");
var ObjectID = require("mongodb").ObjectID;
var io = require("socket.io");
var http = require("http");
var usersMdl = require("./users.js");
var conversationsMdl = require("./conversations.js");
var groupConversationsMdl = require("./group-conversations.js");

module.exports = function(port, db, githubAuthoriser) {
    var app = express();
    var server = http.createServer(app);
    io = io.listen(server);

    app.use(express.static("public"));
    app.use(cookieParser());
    app.use(bodyParser.json());

    var users = db.collection("users");
    var conversations = db.collection("conversations");
    var sessions = {};
    var userToSocket = [];

    var self = this;

    io.on('connection', function(client) {
        console.log('Client connected...');

        client.on('join', function(data) {
            console.log(data);
            console.log(client.id);
            userToSocket[data] = client.id;
            self.addUserToRooms(data, client);
        });

        client.on('disconnect', function(data) {
            console.log("disconnect");
            delete userToSocket[data];
        });

        client.on("sendMessage", function(data) {
            console.log(data);
        });

    });

    usersMdl(app, githubAuthoriser, users, sessions);

    conversationsMdl(app, conversations, userToSocket, io, ObjectID);

    groupConversationsMdl(app, conversations, userToSocket, io, ObjectID);

    return server.listen(port);
};