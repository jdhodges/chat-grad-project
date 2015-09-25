(function() {
    var app = angular.module("ChatApp", ["emguo.poller"]);

    app.controller("ChatController", function($scope, $http, poller) {

        $scope.loggedIn = false;
        $scope.chatHasBeenOpened = false;
        $scope.conversationWith = {};
        $scope.activeConversation = {};
        $scope.newMessage = {};

        var self = this;

        $http.get("/api/user").then(function(userResult) {
            $scope.loggedIn = true;
            $scope.user = userResult.data;
            $http.get("/api/users").then(function(result) {
                $scope.users = result.data;

                $scope.users.forEach(function(user) {
                    user.showNotification = false;
                });
            });
        }, function() {
            $http.get("/api/oauth/uri").then(function(result) {
                $scope.loginUri = result.data.uri;
            });
        });

        //var notificationPoller = poller.get("api/notifications", {
        //     delay: 10000
        //});
        //
        //notificationPoller.promise.then(null , null, function(result) {
        //    var dirtyConversations = result.data;
        //
        //    if (dirtyConversations.length > 0) {
        //        dirtyConversations.forEach(function(dirtyConversation) {
        //            if ($scope.chatHasBeenOpened && $scope.activeConversation._id === dirtyConversation._id) {
        //                // This conversation is already open, refresh it to see the new message(s).
        //                self.getConversationById(dirtyConversation._id);
        //            } else {
        //                // This conversation is not open. Show the notification in the sidebar.
        //                if (dirtyConversation.participants.length > 2) {
        //                    // Group chat
        //                } else {
        //                    // Normal chat
        //                    dirtyConversation.participants.forEach()
        //                }
        //            }
        //        });
        //    }
        //});

        this.initiateConversation = function(toUser) {
            var participants = [];
            participants.push($scope.user._id);

            if ($scope.user._id !== toUser._id) {
                participants.push(toUser._id);
            }

            $scope.conversationWith = toUser;

            self.getConversation(participants);
        };

        this.getConversation = function(participants) {
            $http.post("/api/conversation", participants).success(function(data, status) {
                $scope.chatHasBeenOpened = true;
                $scope.activeConversation = data;
            }).error(function(data, status) {
                $scope.conversationWith = {};
            });
        };

        this.getConversationById = function(conversationId) {
            $http.get("api/conversation/" + conversationId).success(function(data, status) {
                $scope.activeConversation = data;
            }).error(function(data, status) {
                console.log(data);
            });
        };

        this.addMessage = function() {
            $http.post("/api/conversation/" + $scope.activeConversation._id, $scope.newMessage).success(function(data, status) {
                $scope.newMessage.content = "";
                self.getConversationById($scope.activeConversation._id);
            }).error(function(data, status) {
                $scope.newMessage.user = {};
                console.log(data);
            });
        };

        this.getUserById = function(userId) {
            return $scope.users.filter(function(user) {
                return user._id === userId;
            })[0];
        };

    });

    app.directive("navbar", function() {
        return {
            restrict: "E",
            templateUrl: "../navbar.html"
        }
    });

    app.directive("sidebar", function() {
        return {
            restrict: "E",
            templateUrl: "../sidebar.html"
        }
    });
})();
