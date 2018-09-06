# ffdk
f5 iApp Development Kit

## Introduction

The purpose of this project is to streamline the initial steps in creating and deploying a new iApp project. ffdk provides a CLI utility for initializing, building, and deploying iApps. It can also be used as a module for other Node.js applications.

## Installation

ffdk has commands to initialize, build, and deploy a project to development BigIP.

Prerequisite:

`rpmbuild` must be installed on the machine where it is being used.

Clone the repo:

`git clone git://REMOTE_REPO_URL`

Next, add ffdk command, this can be achieved in one of two ways:

`alias ffdk=/LOCAL/PATH/TO/FFDK/REPO/bin/ffdk.js`

Or, a symlink can be created in your path, for example:

`ln -s /LOCAL/PATH/TO/FFDK/REPO/bin/ffdk.js /usr/local/bin/ffdk`

## QuickStart

Follow the installation directions above. 

```
$ mkdir project_name
$ cd project_name
$ ffdk init

## edit project files inside src/nodejs

$ ffdk build

## edit devconfig.json to configure target BigIP and auth credentials

$ ffdk deploy

## test your deployed iApp!
```

## Using ffdk on the Command Line

One the ffdk command is aliased or added to your path, you are ready to create and deploy your iApp.

### ffdk init

The initialize a new project, create a new directory and initialize te project inside that directory:

```
$ mkdir hello_world
$ cd hello_world
$ ffdk init
```

This will create the appropriate file hierarchy, create some basic configuration files, and run npm init.

```
./f5-project.spec                  ## RPM spec file for building deployment package, populated with information from package.json
./devconfig.json                   ## development config file for specifying target dev bigip and credentials usd by CLI utility
./src                              ## this is the root directory of the iapp, and the structure inside should confirm to the iControlLX iApp specificaton
./src/nodejs                     
./src/nodejs/skeletonWorker.js     ## A basic rest worker example, this can be modified or deleted
./src/nodejs/package.json          ## package.json created by npm, dependant modules should be installed within this directory
```

The devconfig.json file looks like this, and may be different for each developer. This file should _not_ be committed to your VCS/SCM as it contains credential information. The first time you create a project on a new development machine, this file will need to be created or populated.

```
{
    "HOST": "IP address or DNS name of your target BigIP",
    "USER": "your big ip username",
    "PASS": "your big ip password",
}
```

An example rest worker is added to the project, skeleton worker, this file can be modified to fit your needs, used as reference, or discarded altogether. When deployed, it will add a new rest endpoint at `/mgmt/shared/hello` by default.

### ffdk build

Once you are ready to run your project on a BigIP, you can build a deployable RPM with:

`ffdk build`

This will build an rpm and output it to a `build/` folder within your directory. By default, rpms are versioned using a unix timestamp.

### ffdk deploy

After the project is successfully built, it can be deployed to the BigIP by typing:

`ffdk deploy`

Now you can use your favorite HTTP client to test your new endpoint.

when used with no arguments, `deploy` will look inside the `./build` directory where it is run, and copy and install the newest RPM to the BigIP configured in `devconfig.json`.

#### Installing a specific RPM

The `deploy` target can also be used to install any arbitrary RPM by specifying it at the command line like so:

`ffdk deploy /path/to/your/package.rpm`

### ffdk query

`ffdk query` will list the packages installed on the configured BigIP. These package names can be passd to `ffdk uninstall` to remove them from the BigIP.

### ffdk uninstall

Packages can be uninstalled using the `ffdk uninstall` command. Removing a package can be achievd by passing a package name from `ffdk query` to the `uninstall` target like so:

`ffdk uninstall package.noarch`

## Using ffdk as a module

In addition to command line use, the ffdk package can be used as a node module in other applications.

At the time of writing, ffdk is not installable as an npm package yet, but can be copied into your node_modules path and required.

WARNING: This functionalty is pre-alpha and the API is subject to change!

```
const ffdk = require('ffdk')

// initialize a project in the current working directory
ffdk.initializeProject();

// build an rpm using the spec file in process.cwd()
const done = () => {
  console.log('Finished!');
};

ffdk.buildRpm(done);


// Upload an RPM to a host BigIP
const opts = {
   HOST: "127.0.0.1",
   USER: "admin",
   PASS: "admin"
}

ffdk.copyToHost(opts, done);


// poll the status of a pending iControl LX task
// task_link is aquired from the body of the initiating HTTP request
ffdk.pollTaskStatus(opts, task_link, done);


// Install an RPM that has been copied to the BigIP
const rpmPath = '/var/config/rest/downloads/project.rpm'

ffdk.installRpmOnBigIp(opts, rpmPath, done);


// Upload and install a local RPM
opts.rpmPath = '/local/path/to/project.rpm'
ffdk.deployToBigIp(opts);


// list installed packages
const callback = (queryResult) => {
  console.log(queryResult);
};

ffdk.queryInstalledPackages(opts, callback);


// uninstall packageName, package names available from ffdk.query
const packageName = 'project.noarch'
ffdk.uninstallPackage(opts, packageName);
```

## Debugging applications

Applications can be debugged by inspecting logs. By logging into the BigIP's bash console, you can read the most recent log with the following commands:

`less +F /var/logs/restnoded/restnoded.log`

Any javascript errors will be reported here, as well as the output from the f5logger module. 

It is possible to use `console.log()` for ad hoc debug messages, that information can be read by using:

`less +F /var/tmp/restnoded.out`