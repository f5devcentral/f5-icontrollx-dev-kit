# ffdk
f5 iControl LX Development Kit

## Introduction

The purpose of this project is to streamline the initial steps in creating and deploying a new iControl LX Extension. ffdk provides a CLI utility for initializing, building, and deploying Node.js code on BIG-IP. It can also be also be used as a module for other Node.js applications that manage iControl LX packages.

This dev kit enables the following options on the command line or within a Node.js application:

- `init` - Creates folder structure and RPM Spec file for a new iControl LX Extension
- `build` - Builds an RPM package for installation on BIG-IP
- `deploy` - Automatically uploads and installs an iControl LX Extension RPM on BIG-IP
- `query` - Query installed iControl LX Extensions
- `uninstall` - Uninstall iControl LX Extensions by package name (obtained by `query`)


## Installation

ffdk has commands to initialize, build, and deploy a project to a BIG-IP.

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

## edit devconfig.json to configure target BIG-IP and auth credentials

$ ffdk deploy

## test your deployed application!
```

## Using ffdk on the Command Line

Once the ffdk command is aliased or added to your path, you are ready to create and deploy a new iControl LX Extension.

### ffdk init

To initialize a new project, create a new directory and initialize te project inside that directory:

```
$ mkdir hello_world
$ cd hello_world
$ ffdk init
```

This will create the appropriate file hierarchy, create some basic configuration files, and run npm init.

```
./f5-project.spec                  ## RPM spec file for building deployment package, populated with information from package.json
./devconfig.json                   ## development config file for specifying target dev BIG-IP and credentials usd by CLI utility
./src                              ## this is the root directory of the extension, and the structure inside should confirm to the iControlLX Extension specificaton
./src/nodejs                     
./src/nodejs/skeletonWorker.js     ## A basic rest worker example, this can be modified or deleted
./src/nodejs/package.json          ## package.json created by npm, dependant modules should be installed within this directory
```

The devconfig.json file looks like this, and may be different for each developer. This file should _not_ be committed to your VCS/SCM as it contains credential information. The first time you create a project on a new development machine, this file will need to be created or populated.

```
{
    "HOST": "IP address or DNS name of your target BIG-IP",
    "USER": "your big ip username",
    "PASS": "your big ip password"
}
```

Alternatively, you can specify these parameters as environment variables. This may be useful for CI/CD flows. If the devconfig file exists, these variables will be ignored.
- `FFDK_HOST`
- `FFDK_USER`
- `FFDK_PASS`

An example rest worker is added to the project, skeleton worker, this file can be modified to fit your needs, used as reference, or discarded altogether. When deployed, it will add a new rest endpoint at `/mgmt/shared/hello` by default.

### ffdk build

Once you are ready to run your project on a BIG-IP, you can build a deployable RPM with:

`ffdk build`

This will build an rpm and output it to a `build/` folder within your directory. By default, rpms are versioned using a unix timestamp.

### ffdk deploy

After the project is successfully built, it can be deployed to a BIG-IP by typing:

`ffdk deploy`

Now you can use your favorite HTTP client to test your new endpoint.

when used with no arguments, `deploy` will look inside the `./build` directory where it is run, and copy and install the newest RPM to a BIG-IP configured in `devconfig.json`.

#### Installing a specific RPM

The `deploy` target can also be used to install any arbitrary RPM by specifying it at the command line like so:

`ffdk deploy /path/to/your/package.rpm`

### ffdk query

`ffdk query` will list the packages installed on the configured BIG-IP. These package names can be passd to `ffdk uninstall` to remove them from a BIG-IP.

### ffdk uninstall

Packages can be uninstalled using the `ffdk uninstall` command. Removing a package can be achievd by passing a package name from `ffdk query` to the `uninstall` target like so:

`ffdk uninstall package.noarch`

## Using ffdk as a module

In addition to command line use, the ffdk package can be used as a node module in other applications.

At the time of writing, ffdk is not installable as an npm package yet, but can be copied into your node_modules path and required.

WARNING: This functionalty is pre-alpha and the API is subject to change!

### ffdk.initializeProject(path [, callback])

- `path` - a string specifying the location of the new project
- `callback(error)` - invoked when finished
  - `error` - contains error object, or null on success

This function will copy project files, create folders, and invoke `npm init` inside `./src/nodejs`

```
const ffdk = require('ffdk')

// initialize a project in the current working directory
const initPath = process.cwd();

ffdk.initializeProject(initPath, (err) => {
  if (err)
    console.error(err)
  else
    console.log(`New project initialized at ${initPath}`);
} );
```

### ffdk.buildRpm(path[, opts][, callback])

- `path` - path to directory to invoke rpmbuild
- `opts` - optionally specify rpm options
  - `rpmSpecfile` - rpm `.spec` file to use, defaults to `f5-project.spec`
  - `destDir` - destination where new RPM will be copied, defaults to `${path}/build`
- `callback(error)` - invoked when finished
  - `error` - contains error object, or null on sucess
  - `stdout` - stdout from the rpmbuild process

This function will invoke rpmbuild using the default spec file, or the spec file specified in the options. The resulting rpm will placed in `./build`, or the directory specified in opts.

```
// build an rpm using the default spec file in cwd
const path = process.cwd();

ffdk.buildRpm(rpmPath, (err, stdout) => {
  if (err) {
    console.error(err)
  } else {
    console.log(stdout);
    console.log(`New RPM copied to ${initPath}/build`);
  }
});
```

### ffdk.deployToBigIp(config, filename [, callback])

- `config` - config object containing HOST, USER, and PASS for HTTP using basic auth
- `filename` - filename of the RPM to deploy
- `callback(error)` - called upon error, or successful deployment
  - `error` - error object, or null on success

returns `EventEmitter` with the following events:
- `progress` - fired when a chunk is uploaded to a BIG-IP
  - `msg` - file upload progress information

This function will upload and install an iControl LX extension RPM to a BIG-IP specified in the config object.

```
// Upload an RPM to a host BIG-IP
const opts = {
   HOST: "127.0.0.1",
   USER: "admin",
   PASS: "admin"
}

// Using and install a local RPM
const rpmPath = '/local/path/to/project.rpm'

ffdk.deployToBigIp(opts, rpmPath, );
```

### ffdk.queryInstalledPackages(config, callback)

- `config` - BIG-IP location and user credentials
- `callback(results)` - called when finished
  - `results` - contains query results

This function queries a BIG-IP for installed packages.

```
// list installed packages
ffdk.queryInstalledPackages(opts, (queryResults) => {
  console.log(queryResults);
});
```

### ffdk.uninstallPackage(config, packageName[, callback])

- `config` - BIG-IP location and user credentials
- `packageName` - package on BIG-IP to remove, can be fetched with query. Usually has a `.noarch` extension.
- `callback(error)` - called on error, or when finished
  - `error` - error object when call unsuccessful

This function will uninstall a package from a BIG-IP.

```
// uninstall packageName, package names available from ffdk.query
const packageName = 'project.noarch'
ffdk.uninstallPackage(opts, packageName);
```

## Debugging applications

Applications can be debugged by inspecting logs. By logging into a BIG-IP's bash console, you can read the most recent log with the following commands:

`less +F /var/logs/restnoded/restnoded.log`

Any javascript errors will be reported here, as well as the output from the f5logger module. 

It is possible to use `console.log()` for ad hoc debug messages, that information can be read by using:

`less +F /var/tmp/restnoded.out`