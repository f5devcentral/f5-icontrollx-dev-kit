'use strict';

const util = require('./lib/util.js');

const run = () => {
    const args = process.argv.slice(2);
    console.log(args);

    const op = args.pop();

    const ops = {
        init: util.initialize_project,
        build: util.build_rpm,
        deploy: util.deploy_to_bigip
    };

    if( ops[op] instanceof Function )
        ops[op]();
    else
        console.error(`invalid operation: ${op}`);        
};

module.exports = run;
