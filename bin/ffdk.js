#!/usr/bin/env node

'use strict';

const ffdk = require('../');

const args = process.argv.slice(2);
console.log(args);

const op = args.shift();

const ops = {
  init: ffdk.initializeProject,
  build: ffdk.buildRpm,
  deploy: ffdk.deployToBigIp,
  query: ffdk.queryInstalledPackages,
  uninstall: ffdk.uninstallPackage
};

if( ops[op] instanceof Function )
  ops[op](args);
else
  console.error(`invalid operation: ${op}`);
