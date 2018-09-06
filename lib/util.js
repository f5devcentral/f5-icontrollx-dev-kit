const fs = require('fs');
const https = require('https');
const { spawn, exec } = require('child_process');
const { Writable } = require('stream');

const ERR_MESSAGE = `
Please create a file in this directory called 'devconfig.json', it should look like this:
{
    "HOST": "<YOUR BIG IP IP ADDRESS>",
    "USER": "<YOUR BIG IP USERNAME (usually admin)>",
    "PASS": "<YOUR BIG IP PASSWORD>",
    "KEY":  "<YOUR BIG IP SSH KEY>",
    "AWS_CREDENTIALS": {
        "accessKeyId": "...",
        "secretAccessKey": "..."
    }
}
    `;

const getDevConfig = () => {
    
    let dev_config = null;

    try {
        return require(process.cwd()+'/devconfig.json');
    } catch(e) {
        console.log(ERR_MESSAGE);
        process.exit(1);
    }
    
};

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

const shExec = (command, done) => {
    console.log(command);
    exec(command, (error, stdout, stderr) => {
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
console.log(version);

const initializeProject = () => {
    console.log('Initializing new iApp project...');
    
    let dir = './src';
    if (!fs.existsSync(dir)){
        fs.mkdirSync(dir);
    }

    dir = './src/nodejs';
    if (!fs.existsSync(dir)){
        fs.mkdirSync(dir);
    }

    fs.copyFileSync(`${__dirname}/../res/f5-project.spec`, './f5-project.spec');
    fs.copyFileSync(`${__dirname}/../res/devconfig.json`, './devconfig.json');
    
    process.chdir(dir);

    fs.copyFileSync(`${__dirname}/../res/skeletonWorker.js`, './skeletonWorker.js');
    
    const npm_init = spawn('npm', ['init'], {stdio: [process.stdin, process.stdout, process.stderr]});

    npm_init.on('exit', () => {
        console.log('finished creating project!');
    });

    npm_init.on('error', () => {
        console.error('error running npm init, is npm installed?');
    });
}
exports.initializeProject = initializeProject;

const fetchLatestBuild = (builds_dir) => {
    const builds = fs.readdirSync(`${process.cwd()}/build`)
          .map((fname) => {
              const ctime = fs.statSync(`build/${fname}`).ctimeMs;
              return {
                  file: fname,
                  ctime: ctime
              }
          })
          .sort((a, b) => {
              return a.ctime >= b.ctime;
          })
          .map(item => item.file)

    return builds.pop();
}

const buildRpm = (done) => {
    const cwd = process.cwd();
    const npm_package = './src/nodejs/package.json'
    const config = fs.existsSync(npm_package) ?
          JSON.parse(fs.readFileSync(npm_package)) :
          {
              name: "icontrol-lx-extension",
              description: "New iControl LX Extention",
              license: "No License",
              author: "unspecified",
              version: "0.0.1"
          };

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
        'f5-project.spec'
    ].join(' ');

    shExec(command, () => {
        const dir = './build';
        if (!fs.existsSync(dir)){
            fs.mkdirSync(dir);
        }
        const rpm_fname = `${config.name}-${config.version}-${version}.noarch.rpm`;
        fs.copyFileSync(`${cwd}/_rpmbuild${version}/RPMS/noarch/${rpm_fname}`,
                        `${cwd}/build/${rpm_fname}`);

        console.log(`created build/${fetchLatestBuild()}`);
        
    });
}
exports.buildRpm = buildRpm;

const scpUploadToHost = (target_build_path, done) => {
    const DEV_CONFIG = getDevConfig();

    const command = [
        'scp',
        `-i ${DEV_CONFIG.KEY}`,
        `${target_build_path}`,
        `${DEV_CONFIG.USER}@${DEV_CONFIG.HOST}:/var/config/rest/downloads/`
    ].join(' ');

    shExec(command, () => {
        done(`/var/config/rest/downloads/${target_build_path.split('/').pop()}`);
    });
}

const multipartUpload = (opts, file_path, cb) => {
    const fstats = fs.statSync(file_path);
    const CHUNK_SIZE = 1000000;
    const upload_part = (start, end) => {
        console.log('Sending chunk ' + start + '-' + end + ' of ' + fstats.size + '...');
        const req = https.request(opts, (res) => {
            console.log(`UPLOAD REQUEST STATUS (${start}-${end}): ${res.statusCode}`);
            res.setEncoding('utf8');
            const resbuf = new ResponseBuffer();
            res.pipe(resbuf);
            res.on('end', () => {
                //console.log(resbuf.text);

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

    if (CHUNK_SIZE < fstats.size)
      upload_part(0, CHUNK_SIZE-1);
    else
      upload_part(0, fstats.size-1);
}

const httpCopyToHost = (target_build_path, done) => {
    const DEV_CONFIG = getDevConfig();
    const rpmname = target_build_path.split('/').pop();

    console.log('Uploading ' + target_build_path + ' to https://' + DEV_CONFIG.HOST + `/mgmt/shared/file-transfer/uploads/${rpmname}` );

    const options = {
        hostname: DEV_CONFIG.HOST,
        auth: `${DEV_CONFIG.USER}:${DEV_CONFIG.PASS}`,
        path: `/mgmt/shared/file-transfer/uploads/${rpmname}`,
        method: 'POST',
    };

    multipartUpload(options, target_build_path, () => {
        done(`/var/config/rest/downloads/${rpmname}`);
    });
}

const copyToHost = httpCopyToHost;
exports.copyToHost = copyToHost;

const pollTaskStatus = (link, cb) => {

    const DEV_CONFIG = getDevConfig();

    const options = {
        hostname: DEV_CONFIG.HOST,
        auth: `${DEV_CONFIG.USER}:${DEV_CONFIG.PASS}`,
        path: link,
        method: 'GET',
    };

    const req = https.request(options, (res) => {
        res.setEncoding('utf8');
        const res_buffer = new ResponseBuffer();
        res.pipe(res_buffer);
        res.on('end', () => {
            const status = JSON.parse(res_buffer.text);
            console.debug(status);
            if( status.status === 'STARTED' ) {
                setTimeout( () => { pollTaskStatus(link, cb); }, 2000);
            } else {
                console.log(status.status, status.errorMessage || '');
                if(cb) cb();
            }
        });
    });
    req.end();
}
exports.pollTaskStatus = pollTaskStatus;

const installRpmOnBigIp = (rpmpath, done) => {
    const DEV_CONFIG = getDevConfig();
    console.log('Installing ' + rpmpath + ' to ' + DEV_CONFIG.HOST);

    const post_body = { operation:"INSTALL",
                        packageFilePath: rpmpath
                      };
    
    console.log(JSON.stringify(post_body));

    const options = {
        hostname: DEV_CONFIG.HOST,
        auth: `${DEV_CONFIG.USER}:${DEV_CONFIG.PASS}`,
        path: '/mgmt/shared/iapp/package-management-tasks',
        method: 'POST',
    };
    
    const req = https.request(options, (res) => {
        console.log(`INSTALL REQUEST STATUS: ${res.statusCode}`);
        res.setEncoding('utf8');
        const res_buffer = new ResponseBuffer();
        res.pipe(res_buffer);
        res.on('end', () => {
            const inst_data = JSON.parse(res_buffer.text);
            const status_link = inst_data.selfLink.slice(17);
            pollTaskStatus(status_link, done);
        });
    });
    
    req.write(JSON.stringify(post_body));
    req.end();
};
exports.installRpmOnBigIp = installRpmOnBigIp;

exports.deployToBigIp = (args) => {

    const target_build = (() => {
        const rpm_path = args.pop();
        if (rpm_path) {
            if (!rpm_path.startsWith('/'))
                return `${process.cwd()}/${rpm_path}`
            else
                return rpm_path;
        }

        return process.cwd() + '/build/' + fetchLatestBuild('./build');
    })();

    console.log(target_build);

    copyToHost(target_build, (rpmpath) => {
        installRpmOnBigIp(rpmpath)
    });

};

const queryInstalledPackages = () => {
    const DEV_CONFIG = getDevConfig();
    const options = {
        hostname: DEV_CONFIG.HOST,
        auth: `${DEV_CONFIG.USER}:${DEV_CONFIG.PASS}`,
        path: '/mgmt/shared/iapp/package-management-tasks',
        method: 'POST',
    };

    const req = https.request(options, (res) => {
        console.log(`QUERY REQUEST STATUS: ${res.statusCode}`);
        res.setEncoding('utf8');
        const res_buffer = new ResponseBuffer();
        res.pipe(res_buffer);
        res.on('end', () => {
          const inst_data = JSON.parse(res_buffer.text);
          options.path = options.path + '/' + inst_data.id;
          options.method = 'GET';
          https.request(options, (res) => {
            const res_buffer = new ResponseBuffer();
            res.pipe(res_buffer);
            res.on('end', () => {
              const data = JSON.parse(res_buffer.text);
              data.queryResponse.forEach((item) => {
                console.log(`${item.name}\t${item.version}\t${item.packageName}`);
              });
            });
          }).end()
        });
    });

    req.write('{ operation: "QUERY" }');
    req.end();
}

exports.queryInstalledPackages = queryInstalledPackages;


const uninstallRpmOnBigIp = (rpmpath, done) => {
    const DEV_CONFIG = getDevConfig();
    console.log('Uninstalling ' + rpmpath + ' to ' + DEV_CONFIG.HOST);

    const post_body = { operation: "UNINSTALL",
                        packageName: rpmpath
                      };
    console.log(JSON.stringify(post_body));

    const options = {
        hostname: DEV_CONFIG.HOST,
        auth: `${DEV_CONFIG.USER}:${DEV_CONFIG.PASS}`,
        path: '/mgmt/shared/iapp/package-management-tasks',
        method: 'POST',
    };

    const req = https.request(options, (res) => {
        console.log(`UNINSTALL REQUEST STATUS: ${res.statusCode}`);
        res.setEncoding('utf8');
        const res_buffer = new ResponseBuffer();
        res.pipe(res_buffer);
        res.on('end', () => {
            const inst_data = JSON.parse(res_buffer.text);
            const status_link = inst_data.selfLink.slice(17);
            pollTaskStatus(status_link, done);
        });
    });

    req.write(JSON.stringify(post_body));
    req.end();
};

exports.uninstallPackage = (args) => {

  const package_name = args.pop();

  if (package_name) {
    console.log(package_name);
    uninstallRpmOnBigIp(package_name);
  } else {
    console.log('nothing to do, please specify package name');
  }
};
