(function() {
    var app = angular.module("ChatApp", ["emguo.poller"]);

    app.controller("ChatController", function($scope, $http, poller) {

        $scope.loggedIn = false;
        $scope.chatHasBeenOpened = false;
        $scope.conversationWith = {};
        $scope.activeConversation = {};
        $scope.newMessage = {};
        $scope.pendingNotifications = [];
        $scope.dropdown = {};
        $scope.showAvatars = true;
        $scope.showGroupNameInput = false;
        $scope.groupNameText = "";

        var self = this;

        $http.get("/api/user").then(function(userResult) {
            $scope.loggedIn = true;
            $scope.user = userResult.data;
            $http.get("/api/users").then(function(result) {
                $scope.users = result.data;

                $scope.users.forEach(function(user) {
                    user.showNotification = false;
                    if (user._id !== $scope.user._id) {
                        user.selectedForNewGroup = false;
                    } else {
                        user.selectedForNewGroup = true;
                    }
                });
            });
        }, function() {
            $http.get("/api/oauth/uri").then(function(result) {
                $scope.loginUri = result.data.uri;
            });
        });

        var notificationPoller = poller.get("api/notifications", {
             delay: 2000
        });

        notificationPoller.promise.then(null , null, function(result) {
            var dirtyConversations = result.data;

            if (dirtyConversations.length > 0) {
                dirtyConversations.forEach(function(dirtyConversation) {
                    if ($scope.chatHasBeenOpened && $scope.activeConversation._id === dirtyConversation.conversationId) {
                        // This conversation is already open, refresh it to see the new message(s).
                        self.getConversationById(dirtyConversation.conversationId);
                    } else {
                        // This conversation is not open. Show the notification in the sidebar.
                        self.setNotification(dirtyConversation.groupOrUserId);
                    }
                });
            }
        });

        this.setNotification = function(groupOrUserId) {
            var isGroupNotification = true;

            $scope.pendingNotifications.push(groupOrUserId);

            if ($scope.users) {
                $scope.users.forEach(function (user) {
                    $scope.pendingNotifications.forEach(function (pendingId) {
                         if (user._id === pendingId) {
                             user.showNotification = true;
                             isGroupNotification = false;
                         }
                    });
                });
            }
            // Another for each for groups!
            $scope.groups.forEach(function (group) {
                $scope.pendingNotifications.forEach(function (pendingId) {
                    if (group._id === pendingId) {
                        group.showNotification = true;
                        isGroupNotification = false;
                    }
                });
            });
        };

        this.initiateConversation = function(toUser) {
            var participants = [];
            participants.push($scope.user._id);

            if ($scope.user._id !== toUser._id) {
                participants.push(toUser._id);
            }

            toUser.showNotification = false;

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

        this.clearConversation = function() {
            $http.delete("/api/conversation/" + $scope.activeConversation._id).success(function(data, status) {
                self.getConversationById($scope.activeConversation._id);
            }).error(function(data, status) {
                console.log(data);
            });
        };

        this.logOut = function() {
            document.cookie = "sessionToken=;expires=Thu, 01 Jan 1970 00:00:00 UTC"
        };

        this.userClicked = function(user) {
            if (user._id !== $scope.user._id) {
                if ($scope.showGroupNameInput) {
                    if (user._id !== $scope.user._id) {
                        user.selectedForNewGroup = !user.selectedForNewGroup;
                    }
                } else {
                    self.initiateConversation(user);
                }
            }
        };

        this.getGroups = function() {
            $http.get("/api/groups").success(function(data, status) {
                $scope.groups = data;

                $scope.groups.forEach(function(group) {
                    group.showNotification = false;
                });
            }).error(function(data, status) {
                console.log(data);
            });
        };

        this.createGroup = function() {
            var groupObj = {};
            groupObj.groupNameText = $scope.groupNameText;
            groupObj.members = [];

            $scope.users.forEach(function(user) {
                if (user.selectedForNewGroup) {
                    groupObj.members.push(user._id);

                    if (user._id !== $scope.user._id) {
                        user.selectedForNewGroup = false;
                    }
                }
            });

            $http.post("/api/groups", groupObj).success(function(data, status) {
                $scope.groups.push(data);
                $scope.groupNameText = "";
                $scope.showGroupNameInput = false;
            }).error(function(data, status) {
                console.log(data);
            });
        };

        this.groupClicked = function(group) {
            $http.post("/api/groupConversation/" + group._id, group.members).success(function(data, status) {
                $scope.activeConversation = data;
                $scope.chatHasBeenOpened = true;
                $scope.conversationWith.name = group.name;
                group.showNotification = false;
            }).error(function(data, status) {
                console.log(data);
            });
        }

        self.getGroups();

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