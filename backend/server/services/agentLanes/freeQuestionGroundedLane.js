const executiveOverviewLane = require('./executiveOverviewLane');

async function run(args = {}) {
  return executiveOverviewLane.run(args);
}

module.exports = {
  run,
};
