const fs = require('fs');
const https = require('https');
const { spawn, exec } = require('child_process');
const { Writable } = require('stream');
const { EventEmitter } = require('events');

class ResponseBuffer extends Writable {
    constructor(opts) {
        super(opts);
        this.text = '';
    }

    _write(chunk, encoding, callback) {
        this.text += chunk;
        callback();
    }
}
exports.ResponseBuffer = ResponseBuffer;

//allow self signed cert
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

//slated for removal, only used for SCP which is currently unused
const shExec = (command, done) => {
    console.log(command);
    return exec(command, (error, stdout, stderr) => {
        if (error) {
            console.error(`exec error: ${error}`);
        } else {
            console.log(`stdout: ${stdout}`);
            console.log(`stderr: ${stderr}`);
        }
        if(done) done();
    });
}

const version = Date.now();

const initializeProject = (path, cb) => {
    const srcDir = `${path}/src`;
    if (!fs.existsSync(srcDir)){
        fs.mkdirSync(srcDir);
    }

    const nodejsDir = `${srcDir}/nodejs`
    if (!fs.existsSync(nodejsDir)){
        fs.mkdirSync(nodejsDir);
    }

    fs.copyFileSync(`${__dirname}/../res/f5-project.spec`, `${path}/f5-project.spec`);
    fs.copyFileSync(`${__dirname}/../res/devconfig.json`, `${path}/devconfig.json`);
    fs.copyFileSync(`${__dirname}/../res/skeletonWorker.js`, `${nodejsDir}/skeletonWorker.js`);
    
    const npm_init = spawn('npm', ['init'],
                           { stdio: [process.stdin, process.stdout, process.stderr],
                             cwd: nodejsDir
                           });

    npm_init.on('exit', () => {
        if (cb) cb();
    });

    npm_init.on('error', (err) => {
        if (cb) cb(err);
    });
}
exports.initializeProject = initializeProject;

const fetchLatestBuild = (builds_dir) => {
    const builds = fs.readdirSync(builds_dir)
          .map((fname) => {
              const ctime = fs.statSync(`${builds_dir}/${fname}`).ctimeMs;
              return {
                  file: fname,
                  ctime: ctime
              }
          })
          .sort((a, b) => {
              return a.ctime >= b.ctime;
          })
          .map(item => item.file)

    return `${builds_dir}/${builds.pop()}`;
}
exports.fetchLatestBuild = fetchLatestBuild;

const buildRpm = (cwd, opts, done) => {
    const npmPackageJson = './src/nodejs/package.json'
    const rpmSpec = opts.rpmSpecfile || 'f5-project.spec';
    const cb = opts instanceof Function ? opts : done;
    const config = fs.existsSync(npmPackageJson) ?
          JSON.parse(fs.readFileSync(npmPackageJson)) :
          {
              name: "icontrol-lx-extension",
              description: "New iControl LX Extention",
              license: "No License",
              author: "unspecified",
              version: "0.0.1"
          };

    if (!fs.existsSync(rpmSpec)) {
        const err = new Error(`File Not Found: ${rpmSpec}`);
        if (cb) cb(err);
        return;
    }

    const command = [
        'rpmbuild',
        '-v',
        '-bb',
        `--define "main ${cwd}"`,
        `--define "_topdir %{main}/_rpmbuild${version}"`,
        `--define "_release ${version}"`,
        `--define "_ilx_name ${config.name}"`,
        `--define "_ilx_description ${config.description}"`,
        `--define "_ilx_version ${config.version}"`,
        `--define "_ilx_license ${config.license}"`,
        `--define "_ilx_author ${config.author}"`,
        rpmSpec
    ].join(' ');

    return exec(command, (error, stdout, stderr) => {
        if (error) {
            if (cb) cb(error, stderr);
        } else {
            const destDir = './build';
            if (!fs.existsSync(destDir)){
                fs.mkdirSync(destDir);
            }
            const rpm_fname = `${config.name}-${config.version}-${version}.noarch.rpm`;
            fs.copyFileSync(`${cwd}/_rpmbuild${version}/RPMS/noarch/${rpm_fname}`,
                            `${cwd}/build/${rpm_fname}`);
            if (cb) cb(null, stdout);
        }

    });
}
exports.buildRpm = buildRpm;

const scpUploadToHost = (opts, done) => {
    const command = [
        'scp',
        `-i ${opts.KEY}`,
        `${opts.rpmPath}`,
        `${opts.USER}@${opts.HOST}:/var/config/rest/downloads/`
    ].join(' ');

    shExec(command, () => {
        done(`/var/config/rest/downloads/${opts.rpmName.split('/').pop()}`);
    });
}

const checkForHttpError = (res) => {
    if (res.statusCode >= 400) {
        const err = new Error(`Status Code ${res.statusCode}`);
        return err;
    }
    return null;
}

const multipartUpload = (opts, file_path, cb) => {
    const eventLog = new EventEmitter();
    const fstats = fs.statSync(file_path);
    const CHUNK_SIZE = 1000000;
    const upload_part = (start, end) => {
        eventLog.emit('progress', 'Sending chunk ' + start + '-' + end + ' of ' + fstats.size + '...');
        const req = https.request(opts, (res) => {
            eventLog.emit('progress', `UPLOAD REQUEST STATUS (${start}-${end}): ${res.statusCode}`);
            res.setEncoding('utf8');
            const resbuf = new ResponseBuffer();
            res.pipe(resbuf);
            res.on('end', () => {
                const error = checkForHttpError(res);
                if (error) {
                    error.body = resbuf.text;
                    if (cb) cb(error);
                    return;
                }

                if (end === fstats.size - 1) {
                    if(cb) cb();
                } else {
                    const next_start = start + CHUNK_SIZE;
                    const next_end = (() => {
                        if(end + CHUNK_SIZE > fstats.size - 1)
                            return fstats.size - 1
                        return end + CHUNK_SIZE
                    })()
                    upload_part(next_start, next_end);
                }
            });
        });

        req.on('error', (err) => { if (cb) cb(err); });

        req.setHeader('Content-Type', 'application/octet-stream');
        req.setHeader('Content-Range', start + '-' + end + '/' + fstats.size);
        req.setHeader('Content-Length', (end - start) + 1);
        req.setHeader('Connection', 'keep-alive');

        const fstream = fs.createReadStream(file_path, {start: start, end: end});
        fstream.on('end', () => {
            req.end();
        });
        fstream.pipe(req);
    }

    setImmediate(() => {
        if (CHUNK_SIZE < fstats.size)
            upload_part(0, CHUNK_SIZE-1);
        else
            upload_part(0, fstats.size-1);
    });

    return eventLog;
}

const httpCopyToHost = (opts, rpmPath, done) => {
    const rpmName = rpmPath.split('/').pop();
    const http_options = {
        hostname: opts.HOST,
        auth: `${opts.USER}:${opts.PASS}`,
        path: `/mgmt/shared/file-transfer/uploads/${rpmName}`,
        method: 'POST',
    };

    return multipartUpload(http_options, rpmPath, (err) => {
        done(err, `/var/config/rest/downloads/${rpmName}`);
    });
}

const copyToHost = httpCopyToHost;
exports.copyToHost = copyToHost;

const pollTaskStatus = (opts, link, cb) => {
    const options = {
        hostname: opts.HOST,
        auth: `${opts.USER}:${opts.PASS}`,
        path: link,
        method: 'GET',
    };

    const req = https.request(options, (res) => {
        res.setEncoding('utf8');
        const res_buffer = new ResponseBuffer();
        res.pipe(res_buffer);
        res.on('end', () => {
            const error = checkForHttpError(res);
            if (error) {
                error.body = resbuf.text;
                if (cb) cb(error);
                return;
            }

            const status = JSON.parse(res_buffer.text);
            if( status.status === 'STARTED' ) {
                setTimeout( () => { pollTaskStatus(opts, link, cb); }, 2000);
            } else {
                if(cb) cb(status.errorMessage, status.status);
            }
        });
    });
    req.on('error', (err) => { if (cb) cb(err) });
    req.end();
}
exports.pollTaskStatus = pollTaskStatus;

const installRpmOnBigIp = (opts, rpmpath, cb) => {
    const post_body = { operation:"INSTALL",
                        packageFilePath: rpmpath
                      };

    const options = {
        hostname: opts.HOST,
        auth: `${opts.USER}:${opts.PASS}`,
        path: '/mgmt/shared/iapp/package-management-tasks',
        method: 'POST',
    };
    
    const req = https.request(options, (res) => {
        res.setEncoding('utf8');
        const res_buffer = new ResponseBuffer();
        res.pipe(res_buffer);
        res.on('end', () => {
            const error = checkForHttpError(res);
            if (error) {
                error.body = resbuf.text;
                if (cb) cb(error);
                return;
            }

            const inst_data = JSON.parse(res_buffer.text);
            const status_link = inst_data.selfLink.slice(17);
            pollTaskStatus(opts, status_link, cb);
        });
    });
    req.on('error', (err) => { if (cb) cb(err) });
    req.write(JSON.stringify(post_body));
    req.end();
};
exports.installRpmOnBigIp = installRpmOnBigIp;

exports.deployToBigIp = (options, rpmPath, cb) => {

    return copyToHost(options, rpmPath, (err, rpm) => {
        if (err) {
            if(cb) cb(err);
        } else {
            installRpmOnBigIp(options, rpm, cb)
        }
    });

};

const queryInstalledPackages = (opts, cb) => {
    const options = {
        hostname: opts.HOST,
        auth: `${opts.USER}:${opts.PASS}`,
        path: '/mgmt/shared/iapp/package-management-tasks',
        method: 'POST',
    };

    const req = https.request(options, (res) => {
        res.setEncoding('utf8');
        const res_buffer = new ResponseBuffer();
        res.pipe(res_buffer);
        res.on('end', () => {
            const error = checkForHttpError(res);
            if (error) {
                if (cb) cb(error);
                return;
            }
            const inst_data = JSON.parse(res_buffer.text);
            options.path = options.path + '/' + inst_data.id;
            options.method = 'GET';
            https.request(options, (res) => {
                const error = checkForHttpError(res);
                if (error) {
                    if (cb) cb(error);
                    return;
                }
                const res_buffer = new ResponseBuffer();
                res.pipe(res_buffer);
                res.on('end', () => {
                    const data = JSON.parse(res_buffer.text);
                    if(cb) cb(null, data);
                });
            }).end()
        });
    });
    req.on('error', (err) => { if (cb) cb(err) });
    req.write('{ operation: "QUERY" }');
    req.end();
}

exports.queryInstalledPackages = queryInstalledPackages;


const uninstallRpmOnBigIp = (opts, rpmpath, cb) => {
    const post_body = { operation: "UNINSTALL",
                        packageName: rpmpath
                      };

    const options = {
        hostname: opts.HOST,
        auth: `${opts.USER}:${opts.PASS}`,
        path: '/mgmt/shared/iapp/package-management-tasks',
        method: 'POST',
    };

    const req = https.request(options, (res) => {
        const error = checkForHttpError(res);
        if (error) {
            if (cb) cb(error);
            return;
        }
        res.setEncoding('utf8');
        const res_buffer = new ResponseBuffer();
        res.pipe(res_buffer);
        res.on('end', () => {
            const inst_data = JSON.parse(res_buffer.text);
            const status_link = inst_data.selfLink.slice(17);
            pollTaskStatus(opts, status_link, cb);
        });
    });
    req.on('error', (err) => { if (cb) cb(err) });
    req.write(JSON.stringify(post_body));
    req.end();
};

exports.uninstallPackage = (options, packageName, cb) => {

    if (packageName) {
        uninstallRpmOnBigIp(options, packageName, cb);
    } else {
        cb(new Error('nothing to do, please specify package name'));
    }
};
