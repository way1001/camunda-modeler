/**
 * Copyright Camunda Services GmbH and/or licensed to Camunda Services GmbH
 * under one or more contributor license agreements. See the NOTICE file
 * distributed with this work for additional information regarding copyright
 * ownership.
 *
 * Camunda licenses this file to you under the MIT; you may not use this file
 * except in compliance with the MIT License.
 */

import AuthTypes from '../../shared/AuthTypes';

import pDefer from 'p-defer';


export default class DeploymentPluginValidator {

  constructor(camundaAPI) {
    this.camundaAPI = camundaAPI;
  }

  createConnectionChecker() {
    return new ConnectionChecker(this);
  }

  validateNonEmpty = (value, message = 'Must provide a value.') => {
    return value ? null : message;
  }

  validateEndpointURL = value => {
    return this.validateNonEmpty(value,'Endpoint URL must not be empty.') ||
      this.validatePattern(value, /^https?:\/\//, 'Endpoint URL must start with "http://" or "https://".') ||
      this.validatePattern(value, /^https?:\/\/.+/, 'Should point to a running Camunda Engine REST API.');
  }

  validatePattern = (value, pattern, message) => {
    const matches = pattern.test(value);

    return matches ? null : message;
  }

  validateConnection = (endpoint) => {
    return this.camundaAPI.checkConnection(endpoint);
  }

  validateConfig = config => {
    const endpointErrors = this.validateEndpoint(config.endpoint);
    const deploymentErrors = this.validateDeployment(config.deployment);

    return { ...endpointErrors, ...deploymentErrors };
  }

  validateDeploymentName = (value, isOnBeforeSubmit) => {
    return this.validateNonEmpty(value, 'Deployment name must not be empty.');
  }

  validateToken = (value) => {
    return this.validateNonEmpty(value, 'Token must not be empty.');
  }

  validatePassword = (value) => {
    return this.validateNonEmpty(value, 'Credentials are required to connect to the server.');
  }

  validateUsername = (value) => {
    return this.validateNonEmpty(value, 'Credentials are required to connect to the server.');
  }

  validateDeployment(deployment = {}) {
    return this.validate(deployment, { name: this.validateDeploymentName });
  }

  validateEndpoint(endpoint = {}) {

    return this.validate(endpoint, {
      url: this.validateEndpointURL,
      token: endpoint.authType === AuthTypes.bearer && this.validateToken,
      password: endpoint.authType === AuthTypes.basic && this.validatePassword,
      username: endpoint.authType === AuthTypes.basic && this.validateUsername
    });
  }

  validate(values, validators) {

    const errors = {};

    for (const [ attr, validator ] of Object.entries(validators)) {

      if (!validator) {
        continue;
      }

      const error = validator(values[attr]);

      if (error) {
        errors[attr] = error;
      }
    }

    return errors;
  }
}

class ConnectionChecker {

  constructor(validator) {
    this.validator = validator;
  }

  subscribe(hooks) {
    this.hooks = hooks;
  }

  unsubscribe() {

    if (this.checkTimer) {
      clearTimeout(this.checkTimer);

      this.checkTimer = null;
    }

    this.endpoint = null;

    this.lastCheck = null;

    this.hooks = null;
  }

  check(endpoint) {
    this.setEndpoint(endpoint);

    const {
      lastCheck
    } = this;

    // return cached result if endpoint did not change
    // we'll periodically re-check in background anyway
    if (lastCheck && shallowEquals(endpoint, lastCheck.endpoint)) {
      return Promise.resolve(lastCheck.result);
    }

    const deferred = this.scheduleCheck();

    return deferred.promise;
  }

  setEndpoint(endpoint) {
    this.endpoint = endpoint;
  }

  checkCompleted(endpoint, result) {

    const {
      endpoint: currentEndpoint,
      deferred,
      hooks
    } = this;

    if (!shallowEquals(endpoint, currentEndpoint)) {
      return;
    }

    const {
      endpointErrors
    } = result;

    this.lastCheck = {
      endpoint,
      result
    };

    this.deferred = null;

    deferred.resolve(result);

    hooks && hooks.onComplete && hooks.onComplete(result);

    if (!hasKeys(endpointErrors)) {
      this.scheduleCheck();
    }
  }

  checkStart() {

    const {
      hooks
    } = this;

    hooks && hooks.onStart && hooks.onStart();
  }

  scheduleCheck() {

    const {
      endpoint,
      lastCheck,
      checkTimer,
      validator
    } = this;

    const deferred = this.deferred = this.deferred || pDefer();

    // stop scheduled check
    if (checkTimer) {
      clearTimeout(checkTimer);
    }

    const endpointErrors = validator.validateEndpoint(endpoint);

    if (hasKeys(endpointErrors)) {
      this.checkCompleted(endpoint, {
        endpointErrors
      });
    } else {

      const delay = this.getCheckDelay(endpoint, lastCheck);

      this.checkTimer = setTimeout(() => {
        this.triggerCheck();
      }, delay);
    }

    return deferred;
  }

  triggerCheck() {
    const {
      endpoint,
      validator
    } = this;

    this.checkStart();

    validator.validateConnection(endpoint).then(connectionResult => {

      this.checkCompleted(endpoint, {
        connectionResult
      });

    }).catch(error => {
      console.error('connection check failed', error);
    });
  }

  getCheckDelay(endpoint, lastCheck) {

    if (!lastCheck) {
      return 1000;
    }

    const {
      endpoint: lastEndpoint
    } = lastCheck;

    const endpointChanged = !shallowEquals(endpoint, lastEndpoint);

    if (endpointChanged) {
      return 1000;
    }

    return 5000;
  }
}

// helpers /////////////////

function hasKeys(obj) {
  return obj && Object.keys(obj).length > 0;
}

function hash(el) {
  return JSON.stringify(el);
}

function shallowEquals(a, b) {
  return hash(a) === hash(b);
}
