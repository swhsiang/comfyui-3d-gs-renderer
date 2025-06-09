import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import terser from '@rollup/plugin-terser';

export default {
  input: 'src/js/main.js',
  output: {
    file: 'dist/main.js',
    format: 'iife', // Immediate invoke the registration of the plugin
    sourcemap: true,
  },
  plugins: [
    resolve(), // Resolve node_modules
    commonjs(), // Resolve CommonJS imports
    terser(), // Minimize the output JS
  ],
}
