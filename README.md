# ffdk
f5 iApp Development Kit

## Introduction

The purpose of this project is to streamline the initial steps in creating and deploying a new iApp project. ffdk provides a CLI utility for initializing, building, and deploying iApps.

## Installation

ffdk has commands to initialize, build, and deploy a project to development BigIP.

First clone this repo:

`git clone git://RMEOTE_REPO_URL`

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

## Using ffdk

One the ffdk command is aliased or added to your path, you are ready to create and deploy your iApp.

### ffdk init

The initialize a new project, create a new directory and initialize te project inside that directory:

```
$ mkdir hello_world
$ cd hello_world
$ffdk init
```


This will create the appropriate file hierarchy, create some basic configuration files, and run npm init.

```
./f5-project.spec                  ## RPM spec file for building deployment package
./devconfig.json                   ## development config file for specifying target dev bigip and credentials
./src                              ## this is the root directory of the iapp, and the structure inside should confirm to the iControlLX iApp specificaton
./src/nodejs                     
./src/nodejs/skeletonWorker.js     ## A basic rest worker example, this can be modified or deleted
./src/nodejs/package.json          ## package.json created by npm, dependant modules should be installed within this directory
```


The devconfig.json file looks like this, and may be different for each developer. This file should _not_ be committed to our VCS/SCM as it contains credential information. The first time you load a project on a new development machine, this file will need to be created or populated. 

```
{
    "HOST": "IP address or DNS name of your taret BigIP",
    "USER": "your big ip username",
    "PASS": "your big ip password",
    "KEY":  "path to your ssh key",
    "AWS_CREDENTIALS": {
        "accessKeyId": "",
        "secretAccessKey": ""
    }
}
```

An example rest worker is added to the project, skeleton worker, this file can be modified to fit your needs, used as reference, or discarded altogether. When deployed, it will add a new rest endpoint at `/mgmt/shared/hello`.

### ffdk build

Once you are ready to run your project on a BigIP, you can build a deployable RPM with:

`ffdk build`

This will build an rpm and output it to a `build/` folder within your directory. By default, rpms are versioned using a unix timestamp.

### ffdk deploy

After the project is successfully built, it can be deployed to the BigIP by typing:

`ffdk deploy`

Now you can use your favorite HTTP client to test your new endpoint.

## Debugging applications

Applications can be debugged by inspecting logs. By logging into the BigIP's bash console, you can read the most recent log with the following commands:

`less +F /var/logs/restnoded/restnoded.log`

Any javascript errors will be reported here, as well as the output from the f5logger module. 

It is possible to use `console.log()` for ad hoc debug messages, that information can be read by using:

`less +F /var/tmp/restnoded.out`