const path = require('path')

module.exports = {
  mode: 'development',
  devtool: 'inline-source-map',
  watch: true,
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
