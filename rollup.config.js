// rollup.config.js
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from '@rollup/plugin-typescript';
import json from '@rollup/plugin-json';
import { glob } from 'glob';

// Encontra todos os arquivos .ts na pasta src, excluindo arquivos de teste
const inputFiles = glob.sync('src/**/*.ts').filter(file => 
  !file.endsWith('.test.ts') && !file.includes('.test.') && !file.includes('db/seed.ts')
);

// Para múltiplos arquivos de entrada, precisamos criar um objeto
const inputEntries = {};
inputFiles.forEach(file => {
  // Remove a extensão .ts e o prefixo 'src/'
  const name = file.replace(/^src\//, '').replace(/\.ts$/, '');
  inputEntries[name] = file;
});

export default {
  input: inputEntries,
  output: {
<<<<<<< HEAD
    dir: 'bundle', // Pasta de saída
=======
    dir: 'src/bundle', // Pasta de saída
>>>>>>> main
    format: 'es',
    entryFileNames: '[name].mjs',
    chunkFileNames: '[name]-[hash].mjs',
    sourcemap: true // Gera sourcemaps para debugging
  },
  plugins: [
    resolve({
      browser: false,
      preferBuiltins: true,
      extensions: ['.js', '.ts'] 
    }),
    commonjs(),
    json(), // Adiciona suporte para importar arquivos JSON
    typescript({
      tsconfig: './tsconfig.json', // Especifica o arquivo tsconfig
      // Corrige o erro TS5096
      noEmit: false,
      emitDeclarationOnly: false
    })
  ],
  
  // Marcar dependências externas para não incluí-las no bundle
  external: [
    'express',
    'cors',
    'dotenv',
    'fastify',
    'zod',
    'pg',
    'mysql2',
    'sqlite3',
    'mongodb',
    'redis',
    'jsonwebtoken',
    'bcrypt',
    'axios',
    'ajv',
    'drizzle-orm',
    '@scalar/openapi-parser',
    ...Object.keys(require('./package.json').dependencies),
    ...Object.keys(require('./package.json').devDependencies)
  ],
  
  // Avisar sobre módulos não encontrados
  onwarn: (warning, warn) => {
    if (warning.code === 'UNRESOLVED_IMPORT') {
      // Ignorar avisos de imports não resolvidos para módulos externos
      if (warning.exporter.startsWith('.')) {
        throw new Error(warning.message);
      }
      return;
    }
    warn(warning);
  }
<<<<<<< HEAD
};
=======
};

// // rollup.config.js
// import resolve from '@rollup/plugin-node-resolve';
// import commonjs from '@rollup/plugin-commonjs';
// import typescript from '@rollup/plugin-typescript';
// import { glob } from 'glob';

// // Para múltiplos arquivos de entrada, você precisa de uma configuração diferente
// const inputFiles = glob.sync('src/**/*.ts');

// export default {
//   input: inputFiles, // Ponto de entrada principal
//   output: {
//     dir: 'src/bundle', // Pasta de saída
//     format: 'es',
//     sourcemap: true // Gera sourcemaps para debugging
//   },
//   plugins: [
//     resolve({
//       browser: true // Para resolver módulos do navegador
//     }),
//     commonjs(),
//     typescript({
//       tsconfig: './tsconfig.json' // Especifica o arquivo tsconfig
//     })
//   ],
  
//   // Opcional: evitar marcar módulos como externos
//   external: [], 
  
//   // Avisar sobre módulos não encontrados
//   onwarn: (warning, warn) => {
//     if (warning.code === 'UNRESOLVED_IMPORT') {
//       throw new Error(warning.message);
//     }
//     warn(warning);
//   }
// };
>>>>>>> main
