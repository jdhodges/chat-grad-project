var server = require("./server/server");
var oAuthGithub = require("./server/oauth-github");
var MongoClient = require("mongodb").MongoClient;

var port = process.env.PORT || 8080;
var dbUri = process.env.DB_URI || "mongodb://jonny:pswrd123@ds051953.mongolab.com:51953/chat-grad-project";
var oauthClientId = process.env.OAUTH_CLIENT_ID || "7717b5a57efbd3821faf";
var oauthSecret = process.env.OAUTH_SECRET || "988a05ee7485babcafdf5be3cc90fc02caf727dd";

MongoClient.connect(dbUri, function(err, db) {
    if (err) {
        console.log("Failed to connect to db", err);
        return;
    }
    var githubAuthoriser = oAuthGithub(oauthClientId, oauthSecret);
    server(port, db, githubAuthoriser);
    console.log("Server running on port " + port);
});
