(function() {
    var app = angular.module("ChatApp", ["emguo.poller"]);

    app.controller("ChatController", function($scope, $http) {
        $scope.loggedIn = false;
        $scope.chatHasBeenOpened = false;
        $scope.conversationWith = {};
        $scope.activeConversation = {};
        $scope.newMessage = {};
        $scope.pendingNotifications = [];
        $scope.dropdown = {};
        $scope.showAvatars = true;
        $scope.createGroupMode = false;
        $scope.groupNameText = "";
        $scope.groupConversations = [];
        $scope.activeConversation.isGroupConversation = false;
        $scope.addUserMode = false;

        var self = this;

        this.enableAddUserMode = function() {
            if (!$scope.createGroupMode) {
                $scope.addUserMode = true;

                // Make sure current members are selected and disabled
                $scope.users.forEach(function (user) {
                    $scope.activeConversation.participants.forEach(function (participant) {
                        if (user._id === participant) {
                            user.selected = true;
                            user.disabled = true;
                        }
                    });
                });

            } else {
                alert("Please finish creating group first.")
            }

        };

        this.addUsersToGroupConversation = function() {
            var usersToAdd = [];

            if ($scope.addUserMode) {
                $scope.users.forEach(function(user) {
                    if (user.selected && !user.disabled) {
                        usersToAdd.push(user._id);
                    }
                });
            }

            if (usersToAdd.length > 0) {
                $http.post("/api/groupConversation/add/" + $scope.activeConversation._id, usersToAdd).success(function (data, status) {
                    self.getConversationById($scope.activeConversation._id);
                }).error(function (data, status) {
                    console.log(data);
                });
            }

            $scope.addUserMode = false;
        };

        this.leaveCurrentGroup = function() {
            $http.delete("/api/groupConversation/leave/" + $scope.activeConversation._id).success(function (data, status) {
                $scope.chatHasBeenOpened = false;
                $scope.conversationWith = {};
                $scope.activeConversation = {};
                $scope.newMessage = {};
                $scope.createGroupMode = false;
                $scope.groupNameText = "";
                $scope.addUserMode = false;
                $scope.user.selected = false;
                $scope.user.disabled = false;
                self.getGroupConversations();
            }).error(function (data, status) {
                console.log(data);
            });
        };

        this.getUsers = function() {
            $http.get("/api/users").then(function(result) {
                $scope.users = result.data;

                $scope.users.forEach(function(user) {
                    user.showNotification = false;
                    if (user._id !== $scope.user._id) {
                        user.selected = false;
                    } else {
                        user.selected = true;
                    }
                });
            });
        };

        this.disableAddUserMode = function() {
            $scope.addUserMode = false;

            self.getUsers();

        };

        this.setNotification = function(groupOrUser) {
            var isGroupNotification = false;

            $scope.groupConversations.forEach(function (groupConversation) {
                if (groupConversation._id === groupOrUser.conversationId) {
                    groupConversation.showNotification = true;
                    isGroupNotification = true;
                    $scope.$apply();
                }
            });

            if (!isGroupNotification) {
                $scope.users.forEach(function (user) {
                    if (user._id === groupOrUser.poster) {
                        user.showNotification = true;
                        $scope.$apply();
                    }
                });
            }
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
                $scope.activeConversation.isGroupConversation = false;
            }).error(function(data, status) {
                $scope.conversationWith = {};
            });
        };

        this.getConversationById = function(conversationId) {
            $http.get("api/conversation/" + conversationId).success(function(data, status) {
                $scope.activeConversation = data;

                if ($scope.activeConversation.name) {
                    $scope.activeConversation.isGroupConversation = true;
                } else {
                    $scope.activeConversation.isGroupConversation = false;
                }

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
            if ($scope.addUserMode) {

                if (!user.disabled) {
                    user.selected = !user.selected;
                }

            } else if (user._id !== $scope.user._id) {
                if ($scope.createGroupMode) {
                    if (user._id !== $scope.user._id) {
                        user.selected = !user.selected;
                    }
                } else {
                    self.initiateConversation(user);
                }
            }
        };

        this.enableCreateGroupMode = function() {
            if (!$scope.addUserMode) {
                $scope.createGroupMode = true;
            } else {
                alert("Please finish adding users.");
            }
        };

        this.getGroupConversations = function() {
            $http.get("/api/groupConversations").success(function(data, status) {
                $scope.groupConversations = data;

                $scope.groupConversations.forEach(function(groupConversation) {
                    groupConversation.showNotification = false;
                });
            }).error(function(data, status) {
                console.log(data);
            });
        };

        this.createGroupConversation = function() {
            var groupConversation = {};
            groupConversation.name = $scope.groupNameText;
            groupConversation.participants = [];

            $scope.users.forEach(function(user) {
                if (user.selected) {
                    groupConversation.participants.push(user._id);

                    if (user._id !== $scope.user._id) {
                        user.selected = false;
                    }
                }
            });

            $http.post("/api/groupConversations", groupConversation).success(function(data, status) {
                $scope.groupConversations.push(data);
                $scope.groupNameText = "";
                $scope.createGroupMode = false;
            }).error(function(data, status) {
                console.log(data);
            });
        };

        this.getGroupConversation = function(groupConversation) {
            $http.get("/api/groupConversations/" + groupConversation._id).success(function(data, status) {
                $scope.activeConversation = data;
                $scope.chatHasBeenOpened = true;
                $scope.conversationWith = groupConversation;
                groupConversation.showNotification = false;

                $scope.activeConversation.isGroupConversation = true;
            }).error(function(data, status) {
                console.log(data);
            });
        };

        this.setupUserSocket = function() {
            $scope.socket = io.connect();

            $scope.socket.on("connect", function(data) {
                $scope.socket.emit("join", $scope.user._id);
            });

            $scope.socket.on("disconnect", function(data) {
                $scope.socket.emit("disconnect", $scope.user._id);
            });

            $scope.socket.on("userUpdate", function() {
                console.log("Users changed, refreshing");
                self.getUsers();
            });

            $scope.socket.on("groupConversationCreated", function() {
                console.log("Group conversation created, refreshing");
                self.getGroupConversations();
            });

            $scope.socket.on("groupConversationUpdated", function(data) {
                console.log("Group conversation updated, refreshing");
                self.getGroupConversations();

                if ($scope.chatHasBeenOpened && data === $scope.activeConversation._id) {
                    self.getConversationById($scope.activeConversation._id);
                }
            });

            $scope.socket.on("messagePosted", function(data) {
                console.log("A message has been posted");
                if ($scope.chatHasBeenOpened && data.conversationId === $scope.activeConversation._id) {
                    self.getConversationById(data.conversationId);
                } else {
                    self.setNotification(data);
                }
            });

            $scope.socket.on("conversationCleared", function(data) {
                console.log("A conversation has been cleared");
                if ($scope.chatHasBeenOpened && data.conversationId === $scope.activeConversation._id) {
                    self.getConversationById(data.conversationId);
                }
            });
        };

        $http.get("/api/user").then(function(userResult) {
            console.log("User logged in!");

            $scope.loggedIn = true;
            $scope.user = userResult.data;

            self.setupUserSocket();
            self.getUsers();
            self.getGroupConversations();
        }, function() {
            $http.get("/api/oauth/uri").then(function(result) {
                $scope.loginUri = result.data.uri;
            });
        });



    });


    // Directives
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

    app.directive("conversation", function() {
        return {
            restrict: "E",
            templateUrl: "../conversation.html"
        }
    });

})();