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

const get_dev_config = () => {
    
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

const shexec = (command, done) => {
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

const initialize_project = () => {
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
exports.initialize_project = initialize_project;

const fetch_latest_build = (builds_dir) => {
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

const build_rpm = (done) => {
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

    shexec(command, () => {
        const dir = './build';
        if (!fs.existsSync(dir)){
            fs.mkdirSync(dir);
        }
        const rpm_fname = `${config.name}-${config.version}-${version}.noarch.rpm`;
        fs.copyFileSync(`${cwd}/_rpmbuild${version}/RPMS/noarch/${rpm_fname}`,
                        `${cwd}/build/${rpm_fname}`);

        console.log(`created build/${fetch_latest_build()}`);
        
    });
}
exports.build_rpm = build_rpm;

const copy_to_host_scp = (target_build_path, done) => {
    const DEV_CONFIG = get_dev_config();

    const command = [
        'scp',
        `-i ${DEV_CONFIG.KEY}`,
        `${target_build_path}`,
        `${DEV_CONFIG.USER}@${DEV_CONFIG.HOST}:/var/config/rest/downloads/`
    ].join(' ');

    shexec(command, () => {
        done(`/var/config/rest/downloads/${target_build_path.split('/').pop()}`);
    });
}

const copy_to_host_http = (target_build_path, done) => {
    const DEV_CONFIG = get_dev_config();
    const fstats = fs.statSync(target_build_path);
    const rpmname = target_build_path.split('/').pop();

    console.log('Uploading ' + target_build_path + ' to https://' + DEV_CONFIG.HOST + `/mgmt/shared/file-transfer/uploads/${rpmname}` );

    const options = {
        hostname: DEV_CONFIG.HOST,
        auth: `${DEV_CONFIG.USER}:${DEV_CONFIG.PASS}`,
        path: `/mgmt/shared/file-transfer/uploads/${rpmname}`,
        method: 'POST',
    };

    const req = https.request(options, (res) => {
        console.log('UPLOAD REQUEST STATUS: '+res.statusCode);
        res.setEncoding('utf8');
        const resbuf = new ResponseBuffer();
        res.pipe(resbuf);
        res.on('end', () => {
            console.log(resbuf.text);
            done(`/var/config/rest/downloads/${rpmname}`);
        });
    });

    req.setHeader('Content-Type', 'application/octet-stream');
    req.setHeader('Content-Range', '0-' + (fstats.size-1) + '/' + fstats.size);
    req.setHeader('Content-Length', fstats.size);
    req.setHeader('Connection', 'keep-alive');

    const fstream = fs.createReadStream(target_build_path);
    fstream.on('end', () => {
        req.end();
    });
    fstream.pipe(req);
}

const copy_to_host = copy_to_host_http;
exports.copy_to_host = copy_to_host;

const poll_status = (link, cb) => {

    const DEV_CONFIG = get_dev_config();

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
                setTimeout( () => { poll_status(link, cb); }, 2000);
            } else {
                console.log(status.status, status.errorMessage || '');
                if(cb) cb();
            }
        });
    });
    req.end();
}
exports.poll_status = poll_status;

const install_on_bigip = (rpmpath, done) => {
    const DEV_CONFIG = get_dev_config();
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
            poll_status(status_link, done);
        });
    });
    
    req.write(JSON.stringify(post_body));
    req.end();
};
exports.install_on_bigip = install_on_bigip;

exports.deploy_to_bigip = (args) => {

    const target_build = (() => {
        const rpm_path = args.pop();
        if (rpm_path) {
            if (!rpm_path.startsWith('/'))
                return `${process.cwd()}/${rpm_path}`
            else
                return rpm_path;
        }

        return process.cwd() + '/build/' + fetch_latest_build('./build');
    })();

    console.log(target_build);

    copy_to_host(target_build, (rpmpath) => {
        install_on_bigip(rpmpath)
    });

};
