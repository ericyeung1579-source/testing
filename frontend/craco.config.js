const webpack = require('webpack');

module.exports = {
  webpack: {
    configure: (webpackConfig) => {
      // Add fallbacks for node core modules
      webpackConfig.resolve.fallback = {
        ...webpackConfig.resolve.fallback,
        "assert": require.resolve("assert/"),
        "buffer": require.resolve("buffer/"),
        "crypto": require.resolve("crypto-browserify"),
        "stream": require.resolve("stream-browserify"),
        "path": false,
        "fs": false,
        "os": false,
      };

      // Provide global polyfills
      webpackConfig.plugins.push(
        new webpack.ProvidePlugin({
          Buffer: ['buffer', 'Buffer'],
          process: 'process/browser',
        })
      );

      return webpackConfig;
    },
  },
};