const path = require('path')

module.exports = {
  watch: true,
  output: {
    filename: 'bundle.js',
  },
  module: {
    rules: [
      { test: /\.ts$/, loader: 'ts-loader' }
    ]
  }
}
