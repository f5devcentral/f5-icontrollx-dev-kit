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
        const opts = { rpmSpecfile: args.pop() }
        ffdk.buildRpm(process.cwd(), opts, (err) => {
            if (err) {
                console.error(err);
                if (err.code === 127)
                    console.error('Is rpmbuild installed?');
            } else {
                console.log(`created ${ffdk.fetchLatestBuild(process.cwd()+'/build')}`);
            }
        });
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

            return ffdk.fetchLatestBuild('./build');
        })();

        console.log(`Deploying ${target_build}`);
        const progress = ffdk.deployToBigIp(devConfig, target_build, (err) => {
            if (err) {
                console.error(err);
            } else {
                console.log(`Deployed ${target_build} successfully.`);
            }
        });

        progress.on('progress', (msg) => {
            console.log(msg);
        });
    },
    query: (args) => {
        ffdk.queryInstalledPackages(devConfig, (err, data) => {
            if (err) {
                console.error(err);
                return;
            }
            data.queryResponse.forEach((item) => {
                console.log(`${item.name}\t${item.version}\t${item.packageName}`);
            });
        });
    },
    uninstall: (args) => {
        ffdk.uninstallPackage(devConfig, args.pop(), (err) => {
            if (err) console.log(err);
        });
    }
};

if( ops[op] instanceof Function ) {
    ops[op](args);
} else {
    console.error(`invalid operation: ${op}`);
}
