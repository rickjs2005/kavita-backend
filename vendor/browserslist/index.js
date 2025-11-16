function browserslist() {
  return [];
}

browserslist.data = { agents: {}, versions: {}, released: {} };
browserslist.defaults = [];
browserslist.findConfig = () => null;
browserslist.findConfigFile = () => null;
browserslist.loadConfig = () => null;
browserslist.clearCaches = () => {};

module.exports = browserslist;
