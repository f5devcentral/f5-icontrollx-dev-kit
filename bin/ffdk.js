#!/usr/bin/env node

'use strict';

const ffdk = require('../');

const ERR_MESSAGE = `
Please create a file in this directory called 'devconfig.json', it should look like this:
{
    "HOST": "<YOUR BIG IP IP ADDRESS>",
    "USER": "<YOUR BIG IP USERNAME>",
    "PASS": "<YOUR BIG IP PASSWORD>"
}
`;

const devConfig = (() => {
    try {
        return require(process.cwd()+'/devconfig.json');
    } catch(e) {
        console.log('no devconfig found, trying environment variables');
        return {
            HOST: process.env.FFDK_HOST,
            USER: process.env.FFDK_USER,
            PASS: process.env.FFDK_PASS
        };
    }
})();

const args = process.argv.slice(2);
const op = args.shift();

const ops = {
    init: (args) => {
        const initPath = args.pop() || process.cwd();
        console.log(`Initializing project at ${initPath}`);
        ffdk.initializeProject(initPath, (err) => {
            if (err) {
                if (err.code === 'ENOENT') {
                    console.error(`${err.path} could not be found, is it installed?`);
                } else {
                    console.error('ERROR: ', err);
                }
            } else {
                console.log(`Project created at ${initPath}!`);
            }
        });
    },
    build: (args) => {
        ffdk.buildRpm();
    },
    deploy: (args) => {
        const target_build = (() => {
            const rpm_path = args.pop();
            if (rpm_path) {
                if (!rpm_path.startsWith('/'))
                    return `${process.cwd()}/${rpm_path}`
                else
                    return rpm_path;
            }

            return process.cwd() + '/build/' + ffdk.fetchLatestBuild('./build');
        })();

        const opts = {};
        opts.rpmPath = target_build;
        Object.keys(devConfig).forEach((key) => { opts[key] = devConfig[key] });
        ffdk.deployToBigIp(opts);
    },
    query: (args) => {
        ffdk.queryInstalledPackages(devConfig, (data) => {
            data.queryResponse.forEach((item) => {
                console.log(`${item.name}\t${item.version}\t${item.packageName}`);
            });
        });
    },
    uninstall: (args) => {
        ffdk.uninstallPackage(devConfig, args.pop());
    }
};

if( ops[op] instanceof Function ) {
    ops[op](args);
} else {
    console.error(`invalid operation: ${op}`);
}
