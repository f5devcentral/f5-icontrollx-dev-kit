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
        console.log('no devconfig found');
        return {};
    }
})();
console.log(devConfig);

const args = process.argv.slice(2);
console.log(args);

const op = args.shift();
console.log(op);

const ops = {
    init: (args) => {
        ffdk.initializeProject()
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
