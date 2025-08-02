import typescript from '@rollup/plugin-typescript';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import { terser } from 'rollup-plugin-terser';
import dts from 'rollup-plugin-dts';

const production = !process.env.ROLLUP_WATCH;

export default [
  // Browser-friendly UMD build
  {
    input: 'src/index.ts',
    output: [
      {
        file: 'dist/squash-sdk.min.js',
        format: 'umd',
        name: 'squash',
        sourcemap: true
      }
    ],
    plugins: [
      nodeResolve({ browser: true }),
      commonjs(),
      typescript({ tsconfig: './tsconfig.json' }),
      production && terser()
    ]
  },
  // CommonJS (for Node) and ES module (for bundlers) build
  {
    input: 'src/index.ts',
    external: [], // No external dependencies
    output: [
      { file: 'dist/index.js', format: 'cjs', sourcemap: true },
      { file: 'dist/index.esm.js', format: 'es', sourcemap: true }
    ],
    plugins: [
      typescript({ tsconfig: './tsconfig.json' })
    ]
  },
  // TypeScript declarations
  {
    input: 'src/index.ts',
    output: [{ file: 'dist/index.d.ts', format: 'es' }],
    plugins: [dts()]
  }
];