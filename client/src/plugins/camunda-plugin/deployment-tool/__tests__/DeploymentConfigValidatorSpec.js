/**
 * Copyright Camunda Services GmbH and/or licensed to Camunda Services GmbH
 * under one or more contributor license agreements. See the NOTICE file
 * distributed with this work for additional information regarding copyright
 * ownership.
 *
 * Camunda licenses this file to you under the MIT; you may not use this file
 * except in compliance with the MIT License.
 */

/* global sinon */

import DeploymentConfigValidator from '../validation/DeploymentConfigValidator';
import AuthTypes from '../../shared/AuthTypes';

const EMPTY_ENDPOINT_ERROR = 'Endpoint URL must not be empty.';
const EMPTY_DEPLOYMENT_NAME_ERROR = 'Deployment name must not be empty.';
const EMPTY_USERNAME_ERROR = 'Credentials are required to connect to the server.';
const EMPTY_PASSWORD_ERROR = 'Credentials are required to connect to the server.';
const EMPTY_TOKEN_ERROR = 'Token must not be empty.';
const INVALID_URL_ERROR = 'Endpoint URL must start with "http://" or "https://".';
const NON_COMPLETE_ERROR = 'Should point to a running Camunda Engine REST API.';


describe('<DeploymentConfigValidator>', () => {

  /**
   * @type {DeploymentConfigValidator}
   */
  let validator;

  beforeEach(() => {
    validator = new DeploymentConfigValidator(createCamundaAPI());
  });


  it('should validate deployment name', () => {

    // given
    const validate = name => validator.validateDeploymentName(name);

    // then
    expect(validate()).to.eql(EMPTY_DEPLOYMENT_NAME_ERROR);
    expect(validate('')).to.eql(EMPTY_DEPLOYMENT_NAME_ERROR);
    expect(validate('deployment name')).to.not.exist;
  });


  it('should validate endpoint url', () => {

    // given
    const validate = url => validator.validateEndpoint({
      authType: AuthTypes.basic,
      url
    });

    // then
    expect(validate().url).to.eql(EMPTY_ENDPOINT_ERROR);
    expect(validate('').url).to.eql(EMPTY_ENDPOINT_ERROR);
    expect(validate('url').url).to.eql(INVALID_URL_ERROR);
    expect(validate('http://localhost:8080').url).to.not.exist;
    expect(validate('https://localhost:8080').url).to.not.exist;
  });


  it('should validate username', () => {

    // given
    const validate = username => validator.validateUsername(username);

    // then
    expect(validate()).to.eql(EMPTY_USERNAME_ERROR);
    expect(validate('')).to.eql(EMPTY_USERNAME_ERROR);
    expect(validate('username')).to.not.exist;
  });


  it('should validate password', () => {

    // given
    const validate = password => validator.validatePassword(password);

    // then
    expect(validate()).to.eql(EMPTY_PASSWORD_ERROR);
    expect(validate('')).to.eql(EMPTY_PASSWORD_ERROR);
    expect(validate('password')).to.not.exist;
  });


  it('should validate token', () => {

    // given
    const validate = token => validator.validateToken(token);

    // then
    expect(validate()).to.eql(EMPTY_TOKEN_ERROR);
    expect(validate('')).to.eql(EMPTY_TOKEN_ERROR);
    expect(validate('token')).to.not.exist;
  });


  it('should validate endpoint URL completeness', () => {

    // given
    const nonCompleteURL = 'https://';

    // when
    const result = validator.validateEndpointURL(nonCompleteURL);

    // then
    expect(result).to.be.eql(NON_COMPLETE_ERROR);
  });


  describe('<ConnectionChecker>', () => {

    it('should be created', () => {

      // given
      const connectionChecker = createConnectionChecker();

      // then
      expect(connectionChecker).to.exist;
    });


    describe('#check', () => {

      it('should work', async () => {

        // given
        const connectionChecker = createConnectionChecker();

        // when
        const { connectionResult } = await connectionChecker.check({});

        // then
        expect(connectionResult).to.be.undefined;
      });


      it('should return last result if endpoint did not change', async () => {

        // given
        const spy = sinon.spy(() => Promise.resolve());
        const endpoint = {
          url: 'http://localhost:8080'
        };
        const connectionChecker = createConnectionChecker(spy);

        // when
        await connectionChecker.check(endpoint);
        await connectionChecker.check(endpoint);

        // then
        expect(spy).to.have.been.calledOnce;
      });


      it('should check again if endpoint changed', async () => {

        // given
        const spy = sinon.spy(() => Promise.resolve({ success: true, response: {} }));
        const endpoint = {
          url: 'http://localhost:8080'
        };
        const connectionChecker = createConnectionChecker(spy);

        // when
        await connectionChecker.check(endpoint);
        await connectionChecker.check({ url: endpoint.url + '/new' });

        // then
        expect(spy).to.have.been.calledTwice;
      });

    });


    describe('#subscribe', () => {

      it('should work', async () => {

        // given
        const onStart = sinon.spy();
        const onComplete = sinon.spy();
        const connectionChecker = createConnectionChecker();
        connectionChecker.subscribe({ onStart, onComplete });

        // when
        const result = await connectionChecker.check({ url: 'http://localhost:8080' });

        // then
        expect(onStart).to.have.been.calledOnce;
        expect(onComplete).to.have.been.calledOnce;
        expect(onComplete.args).to.eql([ [ result ] ]);
      });

    });


    describe('#unsubscribe', () => {

      it('should work', async () => {

        // given
        const onStart = sinon.spy();
        const onComplete = sinon.spy();
        const connectionChecker = createConnectionChecker();
        connectionChecker.subscribe({ onStart, onComplete });
        connectionChecker.unsubscribe();

        // when
        await connectionChecker.check({ url: 'http://localhost:8080' });

        // then
        expect(onStart).not.to.have.been.called;
        expect(onComplete).not.to.have.been.called;
      });

    });

  });
});



// helper
function createConnectionChecker(checkConnectivity, useRealDelays) {
  const camundaAPI = createCamundaAPI(checkConnectivity);
  const validator = new DeploymentConfigValidator(camundaAPI);

  const connectionChecker = validator.createConnectionChecker();

  if (!useRealDelays) {
    connectionChecker.getCheckDelay = () => 0;
  }

  return connectionChecker;
}

function createCamundaAPI(checkConnection) {
  const mockCheck = () => Promise.resolve({ success: true, response: {} });

  return {
    checkConnection: checkConnection || mockCheck
  };
}
