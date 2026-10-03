import {defineConfig} from 'vite';
export default defineConfig({root:'client',build:{outDir:'../dist/client',emptyOutDir:true},server:{host:'0.0.0.0',port:4173,proxy:{'/api':'http://127.0.0.1:3000','/ws':{target:'ws://127.0.0.1:3000',ws:true}}}});
