(function() {
    var app = angular.module("ChatApp", []);

    app.controller("ChatController", function($scope, $http) {

        $scope.loggedIn = false;
        $scope.chatHasBeenOpened = false;
        $scope.activeConversation = {};
        $scope.toUser = {};
        $scope.newMessage = {};

        var self = this;

        $http.get("/api/user").then(function(userResult) {
            $scope.loggedIn = true;
            $scope.user = userResult.data;
            $http.get("/api/users").then(function(result) {
                $scope.users = result.data;
            });
        }, function() {
            $http.get("/api/oauth/uri").then(function(result) {
                $scope.loginUri = result.data.uri;
            });
        });

        this.initiateConversation = function(toUser) {
            self.openConversation(toUser, self.createConversation);
        };

        this.openConversation = function(toUser, callback) {
            $http.get("/api/conversation/" + toUser.id).success(function(data, status) {
                $scope.chatHasBeenOpened = true;
                $scope.toUser = toUser;
                $scope.activeConversation = data;
            }).error(function(data, status) {
                if (status === 404) {
                    if (callback) {
                        callback(toUser);
                    }
                }
            });
        };

        this.createConversation = function(toUser) {
            $http.post("/api/conversation/" + toUser.id).success(function(data, status) {
                self.openConversation(toUser);
            }).error(function(data, status) {
                console.log(data);
            });
        };

        this.addMessage = function() {
            $http.post("/api/conversation/" + $scope.toUser.id + "/msg", $scope.newMessage).success(function(data, status) {
                $scope.newMessage.content = "";
                self.initiateConversation($scope.toUser);
            }).error(function(data, status) {
                console.log(data);
            });
        };

        this.getUser = function(userId) {
            if ($scope.user._id === userId) {
                return $scope.user;
            }

            if ($scope.toUser.id === userId) {
                return $scope.toUser;
            }
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
