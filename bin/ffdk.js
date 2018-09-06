#!/usr/bin/env node

'use strict';

const ffdk = require('../');

const args = process.argv.slice(2);
console.log(args);

const op = args.shift();

const ops = {
  init: ffdk.initialize_project,
  build: ffdk.build_rpm,
  deploy: ffdk.deploy_to_bigip
};

if( ops[op] instanceof Function )
  ops[op](args);
else
  console.error(`invalid operation: ${op}`);
