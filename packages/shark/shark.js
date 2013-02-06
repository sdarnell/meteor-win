//


Shark.build = function (fn, controllerClass) {
  var b = new (controllerClass || Shark.Branch)();
  Shark.rebuild(b, fn);
  return controllerClass ? b : b.firstNode.parentNode;
};

Shark.rebuild = function (branch, fn) {
  
};