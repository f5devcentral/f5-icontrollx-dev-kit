# icrdk
f5 iControl LX Development Kit

## Introduction

The purpose of this project is to streamline the initial steps in creating and deploying a new iControl LX Extension. icrdk provides a CLI utility for initializing, building, and deploying Node.js code on BIG-IP. It can also be also be used as a module for other Node.js applications that manage iControl LX packages.

This dev kit enables the following options on the command line or within a Node.js application:

- `init` - Creates folder structure and RPM Spec file for a new iControl LX Extension
- `build` - Builds an RPM package for installation on BIG-IP
- `deploy` - Automatically uploads and installs an iControl LX Extension RPM on BIG-IP
- `query` - Query installed iControl LX Extensions
- `uninstall` - Uninstall iControl LX Extensions by package name (obtained by `query`)


## Installation

icrdk has commands to initialize, build, and deploy a project to a BIG-IP.

Prerequisite:

`rpmbuild` must be installed on the machine where it is being used.

Clone the repo:

`git clone git://REMOTE_REPO_URL`

Next, add icrdk command, this can be achieved in one of two ways:

`alias icrdk=/LOCAL/PATH/TO/ICRDK/REPO/bin/icrdk.js`

Or, a symlink can be created in your path, for example:

`ln -s /LOCAL/PATH/TO/ICRDK/REPO/bin/icrdk.js /usr/local/bin/icrdk`

or as a node module...

`npm install icrdk@https://github.com/f5devcentral/f5-icontrollx-dev-kit.git`

## QuickStart

Follow the installation directions above. 

```
$ mkdir project_name
$ cd project_name
$ icrdk init

## edit project files inside src/nodejs

$ icrdk build

## edit devconfig.json to configure target BIG-IP and auth credentials

$ icrdk deploy

## test your deployed application!
```

## Using icrdk on the Command Line

Once the icrdk command is aliased or added to your path, you are ready to create and deploy a new iControl LX Extension.

### icrdk init

To initialize a new project, create a new directory and initialize te project inside that directory:

```
$ mkdir hello_world
$ cd hello_world
$ icrdk init
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
    "HOST": "(Required) IP address or DNS name of your target BIG-IP",
    "USER": "(Required) BIG-IP basic auth username",
    "PASS": "(Required) BIG-IP basic auth password",
    "PORT": "(Optional) BIG-IP managment port, default is 443"
}
```

Alternatively, you can specify these parameters as environment variables. This may be useful for CI/CD flows. If the devconfig file exists, these variables will be ignored.
- `ICRDK_HOST`
- `ICRDK_USER`
- `ICRDK_PASS`

An example rest worker is added to the project, skeleton worker, this file can be modified to fit your needs, used as reference, or discarded altogether. When deployed, it will add a new rest endpoint at `/mgmt/shared/hello` by default.

### icrdk build

Once you are ready to run your project on a BIG-IP, you can build a deployable RPM with:

`icrdk build`

This will build an rpm and output it to a `build/` folder within your directory. By default, rpms are versioned using a unix timestamp.

### icrdk deploy

After the project is successfully built, it can be deployed to a BIG-IP by typing:

`icrdk deploy`

Now you can use your favorite HTTP client to test your new endpoint.

when used with no arguments, `deploy` will look inside the `./build` directory where it is run, and copy and install the newest RPM to a BIG-IP configured in `devconfig.json`.

#### Installing a specific RPM

The `deploy` target can also be used to install any arbitrary RPM by specifying it at the command line like so:

`icrdk deploy /path/to/your/package.rpm`

### icrdk query

`icrdk query` will list the packages installed on the configured BIG-IP. These package names can be passd to `icrdk uninstall` to remove them from a BIG-IP.

### icrdk uninstall

Packages can be uninstalled using the `icrdk uninstall` command. Removing a package can be achievd by passing a package name from `icrdk query` to the `uninstall` target like so:

`icrdk uninstall package.noarch`

## Using icrdk as a module

In addition to command line use, the icrdk package can be used as a node module in other applications.

`npm install icrdk@https://github.com/f5devcentral/f5-icontrollx-dev-kit.git`

### icrdk.initializeProject(path [, callback])

- `path` - a string specifying the location of the new project
- `callback(error)` - invoked when finished
  - `error` - contains error object, or null on success

This function will copy project files, create folders, and invoke `npm init` inside `./src/nodejs`

```
const icrdk = require('icrdk')

// initialize a project in the current working directory
const initPath = process.cwd();

icrdk.initializeProject(initPath, (err) => {
  if (err)
    console.error(err)
  else
    console.log(`New project initialized at ${initPath}`);
} );
```

### icrdk.buildRpm(path[, opts][, callback])

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

icrdk.buildRpm(rpmPath, (err, stdout) => {
  if (err) {
    console.error(err)
  } else {
    console.log(stdout);
    console.log(`New RPM copied to ${initPath}/build`);
  }
});
```

### icrdk.deployToBigIp(config, filename [, callback])

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

icrdk.deployToBigIp(opts, rpmPath, );
```

### icrdk.queryInstalledPackages(config, callback)

- `config` - BIG-IP location and user credentials
- `callback(results)` - called when finished
  - `results` - contains query results

This function queries a BIG-IP for installed packages.

```
// list installed packages
icrdk.queryInstalledPackages(opts, (queryResults) => {
  console.log(queryResults);
});
```

### icrdk.uninstallPackage(config, packageName[, callback])

- `config` - BIG-IP location and user credentials
- `packageName` - package on BIG-IP to remove, can be fetched with query. Usually has a `.noarch` extension.
- `callback(error)` - called on error, or when finished
  - `error` - error object when call unsuccessful

This function will uninstall a package from a BIG-IP.

```
// uninstall packageName, package names available from icrdk.query
const packageName = 'project.noarch'
icrdk.uninstallPackage(opts, packageName);
```

## Debugging applications

Applications can be debugged by inspecting logs. By logging into a BIG-IP's bash console, you can read the most recent log with the following commands:

`less +F /var/logs/restnoded/restnoded.log`

Any javascript errors will be reported here, as well as the output from the f5logger module. 

It is possible to use `console.log()` for ad hoc debug messages, that information can be read by using:

`less +F /var/tmp/restnoded.out`

## Revisions

1.0.1
- Renamed package from 'ffdk' to 'icrdk'