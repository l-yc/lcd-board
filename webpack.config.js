const path = require('path')

module.exports = {
  mode: 'production',
  devtool: 'inline-source-map',
  watch: false,
  resolve: {
    extensions: ['.ts', '.js', '.json']
  },
  output: {
    filename: 'bundle.js',
  },
  module: {
    rules: [
      { test: /\.ts$/, loader: 'ts-loader' }
    ]
  }
}
