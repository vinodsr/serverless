'use strict';

/* eslint-disable no-unused-expressions */

const chai = require('chai');
const os = require('os');
const path = require('path');
const JsZip = require('jszip');
const globby = require('globby');
const _ = require('lodash');
const BbPromise = require('bluebird');
const fs = BbPromise.promisifyAll(require('fs'));
const childProcess = BbPromise.promisifyAll(require('child_process'));
const sinon = require('sinon');
const Package = require('../package');
const Serverless = require('../../../Serverless');
const testUtils = require('../../../../tests/utils');

// Configure chai
chai.use(require('chai-as-promised'));
chai.use(require('sinon-chai'));
const expect = require('chai').expect;

describe('zipService', () => {
  let tmpDirPath;
  let serverless;
  let packagePlugin;
  let params;

  beforeEach(() => {
    tmpDirPath = testUtils.getTmpDirPath();
    serverless = new Serverless();
    serverless.service.service = 'first-service';
    serverless.config.servicePath = tmpDirPath;
    packagePlugin = new Package(serverless, {});
    packagePlugin.serverless.cli = new serverless.classes.CLI();
    params = {
      include: ['user-defined-include-me'],
      exclude: ['user-defined-exclude-me'],
      zipFileName: 'my-service.zip',
    };
  });

  describe('#zipService()', () => {
    let excludeDevDependenciesStub;
    let zipStub;

    beforeEach(() => {
      excludeDevDependenciesStub = sinon.stub(packagePlugin, 'excludeDevDependencies').resolves();
      zipStub = sinon.stub(packagePlugin, 'zip').resolves();
    });

    afterEach(() => {
      packagePlugin.excludeDevDependencies.restore();
      packagePlugin.zip.restore();
    });

    it('should run promise chain in order', () => {
      const exclude = params.exclude;
      const include = params.include;
      const zipFileName = params.zipFileName;

      return expect(packagePlugin.zipService(exclude, include, zipFileName)).to.be
        .fulfilled.then(() => {
          expect(excludeDevDependenciesStub).to.have.been.calledOnce;
          expect(zipStub).to.have.been.calledOnce;
        });
    });
  });

  describe('#excludeDevDependencies()', () => {
    it('should resolve when opted out of dev dependency exclusion', () => {
      packagePlugin.serverless.service.package.excludeDevDependencies = false;

      return expect(packagePlugin.excludeDevDependencies(params)).to.be
        .fulfilled.then((updatedParams) => {
          expect(updatedParams).to.deep.equal(params);
        });
    });

    describe('when dealing with Node.js runtimes', () => {
      let globbySyncStub;
      let execAsyncStub;
      let readFileAsyncStub;
      let servicePath;

      beforeEach(() => {
        servicePath = packagePlugin.serverless.config.servicePath;
        globbySyncStub = sinon.stub(globby, 'sync');
        execAsyncStub = sinon.stub(childProcess, 'execAsync');
        readFileAsyncStub = sinon.stub(fs, 'readFileAsync');
      });

      afterEach(() => {
        globby.sync.restore();
        childProcess.execAsync.restore();
        fs.readFileAsync.restore();
      });

      it('should do nothing if no packages are used', () => {
        const filePaths = [];

        globbySyncStub.returns(filePaths);

        return expect(packagePlugin.excludeDevDependencies(params)).to.be
          .fulfilled.then((updatedParams) => {
            expect(globbySyncStub).to.have.been.calledOnce;
            expect(execAsyncStub).to.not.have.been.called;
            expect(readFileAsyncStub).to.not.have.been.called;
            expect(globbySyncStub).to.have.been
              .calledWithExactly(['**/package.json'], {
                cwd: packagePlugin.serverless.config.servicePath,
                dot: true,
                silent: true,
                follow: true,
                nosort: true,
              });
            expect(updatedParams.exclude).to.deep.equal([
              'user-defined-exclude-me',
            ]);
            expect(updatedParams.include).to.deep.equal([
              'user-defined-include-me',
            ]);
            expect(updatedParams.zipFileName).to.equal(params.zipFileName);
          });
      });

      it('should do nothing if no dependencies are found', () => {
        const filePaths = ['package.json', 'node_modules'];

        globbySyncStub.returns(filePaths);
        execAsyncStub.resolves();
        const depPaths = '';
        readFileAsyncStub.resolves(depPaths);

        return expect(packagePlugin.excludeDevDependencies(params)).to.be
          .fulfilled.then((updatedParams) => {
            expect(globbySyncStub).to.have.been.calledOnce;
            expect(execAsyncStub).to.have.been.calledOnce;
            expect(readFileAsyncStub).to.have.been.calledOnce;
            expect(globbySyncStub).to.have.been
              .calledWithExactly(['**/package.json'], {
                cwd: packagePlugin.serverless.config.servicePath,
                dot: true,
                silent: true,
                follow: true,
                nosort: true,
              });
            expect(execAsyncStub.args[0][0]).to
              .match(/npm ls --dev=true --parseable=true --silent >> .+/);
            expect(execAsyncStub.args[0][1].cwd).to
              .match(/.+/);
            expect(updatedParams.exclude).to.deep.equal([
              'user-defined-exclude-me',
            ]);
            expect(updatedParams.include).to.deep.equal([
              'user-defined-include-me',
            ]);
            expect(updatedParams.zipFileName).to.equal(params.zipFileName);
          });
      });

      it('should return excludes and includes if an error is thrown in the global scope', () => {
        globbySyncStub.rejects();

        return expect(packagePlugin.excludeDevDependencies(params)).to.be
          .fulfilled.then((updatedParams) => {
            expect(globbySyncStub).to.have.been.calledOnce;
            expect(execAsyncStub).to.not.have.been.called;
            expect(readFileAsyncStub).to.not.have.been.called;
            expect(updatedParams.exclude).to.deep.equal([
              'user-defined-exclude-me',
            ]);
            expect(updatedParams.include).to.deep.equal([
              'user-defined-include-me',
            ]);
            expect(updatedParams.zipFileName).to.equal(params.zipFileName);
          });
      });

      it('should return excludes and includes if a Promise is rejected in the chain', () => {
        const filePaths = ['package.json', 'node_modules'];

        globbySyncStub.returns(filePaths);
        execAsyncStub.resolves();
        readFileAsyncStub.rejects();

        return expect(packagePlugin.excludeDevDependencies(params)).to.be
          .fulfilled.then((updatedParams) => {
            expect(globbySyncStub).to.been.calledOnce;
            expect(execAsyncStub).to.have.been.calledOnce;
            expect(readFileAsyncStub).to.have.been.calledOnce;
            expect(updatedParams.exclude).to.deep.equal([
              'user-defined-exclude-me',
            ]);
            expect(updatedParams.include).to.deep.equal([
              'user-defined-include-me',
            ]);
            expect(updatedParams.zipFileName).to.equal(params.zipFileName);
          });
      });

      it('should fail silently and continue if "npm ls" call throws an error', () => {
        const filePaths = [
          // root of the service
          'package.json', 'node_modules',
          // nested-dir
          // NOTE: reading the dependencies in this directory will fail in this tests
          path.join('1st', 'package.json'),
          path.join('1st', 'node_modules'),
          // nested-dir which is nested
          path.join('1st', '2nd', 'package.json'),
          path.join('1st', '2nd', 'node_modules'),
        ];

        globbySyncStub.returns(filePaths);
        execAsyncStub.onCall(0).resolves();
        execAsyncStub.onCall(1).rejects();
        execAsyncStub.onCall(2).resolves();
        const depPaths = [
          `${servicePath}/node_modules/module-1`,
          `${servicePath}/node_modules/module-2`,
          `${servicePath}/1st/2nd/node_modules/module-1`,
          `${servicePath}/1st/2nd/node_modules/module-2`,
        ].join('\n');
        readFileAsyncStub.resolves(depPaths);

        return expect(packagePlugin.excludeDevDependencies(params)).to.be
          .fulfilled.then((updatedParams) => {
            expect(globbySyncStub).to.have.been.calledOnce;
            expect(execAsyncStub.callCount).to.equal(3);
            expect(readFileAsyncStub).to.have.been.calledOnce;
            expect(globbySyncStub).to.have.been
              .calledWithExactly(['**/package.json'], {
                cwd: packagePlugin.serverless.config.servicePath,
                dot: true,
                silent: true,
                follow: true,
                nosort: true,
              });
            expect(execAsyncStub.args[0][0]).to
              .match(/npm ls --dev=true --parseable=true --silent >> .+/);
            expect(execAsyncStub.args[0][1].cwd).to
              .match(/.+/);
            expect(execAsyncStub.args[1][0]).to
              .match(/npm ls --dev=true --parseable=true --silent >> .+/);
            expect(execAsyncStub.args[1][1].cwd).to
              .match(/.+/);
            expect(execAsyncStub.args[2][0]).to
              .match(/npm ls --dev=true --parseable=true --silent >> .+/);
            expect(execAsyncStub.args[2][1].cwd).to
              .match(/.+/);
            expect(updatedParams.exclude).to.deep.equal([
              'user-defined-exclude-me',
              'node_modules/module-1/**',
              'node_modules/module-2/**',
              '1st/2nd/node_modules/module-1/**',
              '1st/2nd/node_modules/module-2/**',
            ]);
            expect(updatedParams.include).to
              .deep.equal([
                'user-defined-include-me',
              ]);
            expect(updatedParams.zipFileName).to.equal(params.zipFileName);
          });
      });

      it('should exclude dev dependencies in the services root directory', () => {
        const filePaths = ['package.json', 'node_modules'];

        globbySyncStub.returns(filePaths);
        execAsyncStub.resolves();
        const depPaths = [
          `${servicePath}/node_modules/module-1`,
          `${servicePath}/node_modules/module-2`,
        ].join('\n');
        readFileAsyncStub.resolves(depPaths);

        return expect(packagePlugin.excludeDevDependencies(params)).to.be
          .fulfilled.then((updatedParams) => {
            expect(globbySyncStub).to.have.been.calledOnce;
            expect(execAsyncStub).to.have.been.calledOnce;
            expect(readFileAsyncStub).to.have.been.calledOnce;
            expect(globbySyncStub).to.have.been
              .calledWithExactly(['**/package.json'], {
                cwd: packagePlugin.serverless.config.servicePath,
                dot: true,
                silent: true,
                follow: true,
                nosort: true,
              });
            expect(execAsyncStub.args[0][0]).to
              .match(/npm ls --dev=true --parseable=true --silent >> .+/);
            expect(execAsyncStub.args[0][1].cwd).to
              .match(/.+/);
            expect(updatedParams.exclude).to.deep.equal([
              'user-defined-exclude-me',
              'node_modules/module-1/**',
              'node_modules/module-2/**',
            ]);
            expect(updatedParams.include).to.deep.equal([
              'user-defined-include-me',
            ]);
            expect(updatedParams.zipFileName).to.equal(params.zipFileName);
          });
      });

      it('should exclude dev dependencies in deeply nested services directories', () => {
        const filePaths = [
          // root of the service
          'package.json', 'node_modules',
          // nested-dir
          path.join('1st', 'package.json'),
          path.join('1st', 'node_modules'),
          // nested-dir which is nested
          path.join('1st', '2nd', 'package.json'),
          path.join('1st', '2nd', 'node_modules'),
        ];

        globbySyncStub.returns(filePaths);
        execAsyncStub.resolves();
        const depPaths = [
          `${servicePath}/node_modules/module-1`,
          `${servicePath}/node_modules/module-2`,
          `${servicePath}/1st/node_modules/module-1`,
          `${servicePath}/1st/node_modules/module-2`,
          `${servicePath}/1st/2nd/node_modules/module-1`,
          `${servicePath}/1st/2nd/node_modules/module-2`,
        ].join('\n');
        readFileAsyncStub.resolves(depPaths);

        return expect(packagePlugin.excludeDevDependencies(params)).to.be
          .fulfilled.then((updatedParams) => {
            expect(globbySyncStub).to.have.been.calledOnce;
            expect(execAsyncStub.callCount).to.equal(3);
            expect(readFileAsyncStub).to.have.been.calledOnce;
            expect(globbySyncStub).to.have.been
              .calledWithExactly(['**/package.json'], {
                cwd: packagePlugin.serverless.config.servicePath,
                dot: true,
                silent: true,
                follow: true,
                nosort: true,
              });
            expect(execAsyncStub.args[0][0]).to
              .match(/npm ls --dev=true --parseable=true --silent >> .+/);
            expect(execAsyncStub.args[0][1].cwd).to
              .match(/.+/);
            expect(execAsyncStub.args[1][0]).to
              .match(/npm ls --dev=true --parseable=true --silent >> .+/);
            expect(execAsyncStub.args[1][1].cwd).to
              .match(/.+/);
            expect(execAsyncStub.args[2][0]).to
              .match(/npm ls --dev=true --parseable=true --silent >> .+/);
            expect(execAsyncStub.args[2][1].cwd).to
              .match(/.+/);
            expect(updatedParams.exclude).to.deep.equal([
              'user-defined-exclude-me',
              'node_modules/module-1/**',
              'node_modules/module-2/**',
              '1st/node_modules/module-1/**',
              '1st/node_modules/module-2/**',
              '1st/2nd/node_modules/module-1/**',
              '1st/2nd/node_modules/module-2/**',
            ]);
            expect(updatedParams.include).to.deep.equal([
              'user-defined-include-me',
            ]);
            expect(updatedParams.zipFileName).to.equal(params.zipFileName);
          });
      });
    });
  });

  describe('#zip()', () => {
    let zip;

    const testDirectory = {
      // root
      '.': {
        'event.json': 'some content',
        'handler.js': 'some content',
        'file-1': 'some content',
        'file-2': 'some content',
      },
      // bin
      bin: {
        'binary-777': {
          content: 'some content',
          permissions: 777,
        },
        'binary-444': {
          content: 'some content',
          permissions: 444,
        },
      },
      // lib
      lib: {
        'file-1.js': 'some content',
      },
      'lib/directory-1': {
        'file-1.js': 'some content',
      },
      // node_modules
      'node_modules/directory-1': {
        'file-1': 'some content',
        'file-2': 'some content',
      },
      'node_modules/directory-2': {
        'file-1': 'some content',
        'file-2': 'some content',
      },
    };

    function getTestArtifactFileName(testName) {
      return `test-${testName}-${(new Date()).getTime().toString()}.zip`;
    }

    beforeEach(() => {
      zip = new JsZip();

      Object.keys(testDirectory).forEach(dirName => {
        const dirPath = path.join(tmpDirPath, dirName);
        const files = testDirectory[dirName];

        Object.keys(files).forEach(fileName => {
          const filePath = path.join(dirPath, fileName);
          const fileValue = files[fileName];
          const file = _.isObject(fileValue) ? fileValue : { content: fileValue };

          if (!file.content) {
            throw new Error('File content is required');
          }

          serverless.utils.writeFileSync(filePath, file.content);

          if (file.permissions) {
            fs.chmodSync(filePath, file.permissions);
          }
        });
      });
    });

    it('should zip a whole service (without include / exclude usage)', () => {
      params.zipFileName = getTestArtifactFileName('whole-service');

      return expect(packagePlugin.zip(params)).to.eventually.be
        .equal(path.join(serverless.config.servicePath, '.serverless', params.zipFileName))
      .then(artifact => {
        const data = fs.readFileSync(artifact);
        return expect(zip.loadAsync(data)).to.be.fulfilled;
      })
      .then(unzippedData => {
        const unzippedFileData = unzippedData.files;

        expect(Object.keys(unzippedFileData)
         .filter(file => !unzippedFileData[file].dir))
         .to.be.lengthOf(13);

        // root directory
        expect(unzippedFileData['event.json'].name)
          .to.equal('event.json');
        expect(unzippedFileData['handler.js'].name)
          .to.equal('handler.js');
        expect(unzippedFileData['file-1'].name)
          .to.equal('file-1');
        expect(unzippedFileData['file-2'].name)
          .to.equal('file-2');

        // bin directory
        expect(unzippedFileData['bin/binary-777'].name)
          .to.equal('bin/binary-777');
        expect(unzippedFileData['bin/binary-444'].name)
          .to.equal('bin/binary-444');

        // lib directory
        expect(unzippedFileData['lib/file-1.js'].name)
          .to.equal('lib/file-1.js');
        expect(unzippedFileData['lib/directory-1/file-1.js'].name)
          .to.equal('lib/directory-1/file-1.js');

        // node_modules directory
        expect(unzippedFileData['node_modules/directory-1/file-1'].name)
          .to.equal('node_modules/directory-1/file-1');
        expect(unzippedFileData['node_modules/directory-1/file-2'].name)
          .to.equal('node_modules/directory-1/file-2');
        expect(unzippedFileData['node_modules/directory-2/file-1'].name)
          .to.equal('node_modules/directory-2/file-1');
        expect(unzippedFileData['node_modules/directory-2/file-2'].name)
          .to.equal('node_modules/directory-2/file-2');
      });
    });

    it('should keep file permissions', () => {
      params.zipFileName = getTestArtifactFileName('file-permissions');

      return expect(packagePlugin.zip(params)).to.eventually.be
        .equal(path.join(serverless.config.servicePath, '.serverless', params.zipFileName))
      .then(artifact => {
        const data = fs.readFileSync(artifact);
        return expect(zip.loadAsync(data)).to.be.fulfilled;
      }).then(unzippedData => {
        const unzippedFileData = unzippedData.files;

        if (os.platform() === 'win32') {
          // chmod does not work right on windows. this is better than nothing?
          expect(unzippedFileData['bin/binary-777'].unixPermissions)
            .to.not.equal(unzippedFileData['bin/binary-444'].unixPermissions);
        } else {
          // binary file is set with chmod of 777
          expect(unzippedFileData['bin/binary-777'].unixPermissions)
            .to.equal(Math.pow(2, 15) + 777);

          // read only file is set with chmod of 444
          expect(unzippedFileData['bin/binary-444'].unixPermissions)
            .to.equal(Math.pow(2, 15) + 444);
        }
      });
    });

    it('should exclude with globs', () => {
      params.zipFileName = getTestArtifactFileName('exclude-with-globs');
      params.exclude = [
        'event.json',
        'lib/**',
        'node_modules/directory-1/**',
      ];

      return expect(packagePlugin.zip(params)).to.eventually.be
        .equal(path.join(serverless.config.servicePath, '.serverless', params.zipFileName))
      .then(artifact => {
        const data = fs.readFileSync(artifact);
        return expect(zip.loadAsync(data)).to.be.fulfilled;
      }).then(unzippedData => {
        const unzippedFileData = unzippedData.files;

        expect(Object.keys(unzippedFileData)
          .filter(file => !unzippedFileData[file].dir))
          .to.be.lengthOf(8);

        // root directory
        expect(unzippedFileData['handler.js'].name)
          .to.equal('handler.js');
        expect(unzippedFileData['file-1'].name)
          .to.equal('file-1');
        expect(unzippedFileData['file-2'].name)
          .to.equal('file-2');

        // bin directory
        expect(unzippedFileData['bin/binary-777'].name)
          .to.equal('bin/binary-777');
        expect(unzippedFileData['bin/binary-444'].name)
          .to.equal('bin/binary-444');

        // node_modules directory
        expect(unzippedFileData['node_modules/directory-2/file-1'].name)
          .to.equal('node_modules/directory-2/file-1');
        expect(unzippedFileData['node_modules/directory-2/file-2'].name)
          .to.equal('node_modules/directory-2/file-2');
      });
    });

    it('should re-include files using ! glob pattern', () => {
      params.zipFileName = getTestArtifactFileName('re-include-with-globs');
      params.exclude = [
        'event.json',
        'lib/**',
        'node_modules/directory-1/**',

        '!event.json', // re-include
        '!lib/**', // re-include
      ];

      return expect(packagePlugin.zip(params)).to.eventually.be
        .equal(path.join(serverless.config.servicePath, '.serverless', params.zipFileName))
      .then(artifact => {
        const data = fs.readFileSync(artifact);
        return expect(zip.loadAsync(data)).to.be.fulfilled;
      }).then(unzippedData => {
        const unzippedFileData = unzippedData.files;

        expect(Object.keys(unzippedFileData)
          .filter(file => !unzippedFileData[file].dir))
          .to.be.lengthOf(11);

        // root directory
        expect(unzippedFileData['event.json'].name)
          .to.equal('event.json');
        expect(unzippedFileData['handler.js'].name)
          .to.equal('handler.js');
        expect(unzippedFileData['file-1'].name)
          .to.equal('file-1');
        expect(unzippedFileData['file-2'].name)
          .to.equal('file-2');

        // bin directory
        expect(unzippedFileData['bin/binary-777'].name)
          .to.equal('bin/binary-777');
        expect(unzippedFileData['bin/binary-444'].name)
          .to.equal('bin/binary-444');

        // lib directory
        expect(unzippedFileData['lib/file-1.js'].name)
          .to.equal('lib/file-1.js');
        expect(unzippedFileData['lib/directory-1/file-1.js'].name)
          .to.equal('lib/directory-1/file-1.js');

        // node_modules directory
        expect(unzippedFileData['node_modules/directory-2/file-1'].name)
          .to.equal('node_modules/directory-2/file-1');
        expect(unzippedFileData['node_modules/directory-2/file-2'].name)
          .to.equal('node_modules/directory-2/file-2');
      });
    });

    it('should re-include files using include config', () => {
      params.zipFileName = getTestArtifactFileName('re-include-with-include');
      params.exclude = [
        'event.json',
        'lib/**',
        'node_modules/directory-1/**',
      ];
      params.include = [
        'event.json',
        'lib/**',
      ];

      return expect(packagePlugin.zip(params)).to.eventually.be
        .equal(path.join(serverless.config.servicePath, '.serverless', params.zipFileName))
      .then(artifact => {
        const data = fs.readFileSync(artifact);
        return expect(zip.loadAsync(data)).to.be.fulfilled;
      }).then(unzippedData => {
        const unzippedFileData = unzippedData.files;

        expect(Object.keys(unzippedFileData)
          .filter(file => !unzippedFileData[file].dir))
          .to.be.lengthOf(11);

        // root directory
        expect(unzippedFileData['event.json'].name)
          .to.equal('event.json');
        expect(unzippedFileData['handler.js'].name)
          .to.equal('handler.js');
        expect(unzippedFileData['file-1'].name)
          .to.equal('file-1');
        expect(unzippedFileData['file-2'].name)
          .to.equal('file-2');

        // bin directory
        expect(unzippedFileData['bin/binary-777'].name)
          .to.equal('bin/binary-777');
        expect(unzippedFileData['bin/binary-444'].name)
          .to.equal('bin/binary-444');

        // lib directory
        expect(unzippedFileData['lib/file-1.js'].name)
          .to.equal('lib/file-1.js');
        expect(unzippedFileData['lib/directory-1/file-1.js'].name)
          .to.equal('lib/directory-1/file-1.js');

        // node_modules directory
        expect(unzippedFileData['node_modules/directory-2/file-1'].name)
          .to.equal('node_modules/directory-2/file-1');
        expect(unzippedFileData['node_modules/directory-2/file-2'].name)
          .to.equal('node_modules/directory-2/file-2');
      });
    });

    it('should throw an error if no files are matched', () => {
      params.exclude = ['**/**'];
      params.include = [];
      params.zipFileName = getTestArtifactFileName('empty');

      return expect(packagePlugin.zip(params)).to.be
        .rejectedWith(Error, 'file matches include / exclude');
    });
  });
});
