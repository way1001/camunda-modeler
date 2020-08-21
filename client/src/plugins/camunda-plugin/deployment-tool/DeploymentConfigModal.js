/**
 * Copyright Camunda Services GmbH and/or licensed to Camunda Services GmbH
 * under one or more contributor license agreements. See the NOTICE file
 * distributed with this work for additional information regarding copyright
 * ownership.
 *
 * Camunda licenses this file to you under the MIT; you may not use this file
 * except in compliance with the MIT License.
 */

import React from 'react';

import { Modal } from '../../../app/primitives';

import {
  omit
} from 'min-dash';

import css from './DeploymentConfigModal.less';

import AuthTypes from '../shared/AuthTypes';

import {
  CheckBox,
  Radio,
  TextInput
} from '../shared/components';

import { ApiErrors } from './../shared/CamundaAPI';

import {
  Form,
  Formik,
  Field
} from 'formik';


const CONNECTION_STATE = {
  INITIAL: 'initial',
  INVALID_ENDPOINT: 'invalidEndpoint',
  ERROR: 'error',
  CONNECTED: 'connected'
};

export default class DeploymentConfigModal extends React.PureComponent {

  constructor(props) {
    super(props);

    this.state = {
      isAuthNeeded: false,
      connectionState: { type: CONNECTION_STATE.INITIAL }
    };

    this.connectionChecker = props.validator.createConnectionChecker();
  }

  componentDidMount = () => {
    const {
      subscribeToFocusChange
    } = this.props;

    const {
      onAppFocusChange
    } = this;

    subscribeToFocusChange(onAppFocusChange);

    this.connectionChecker.subscribe({
      onComplete: this.handleConnectionCheckResult
    });
  }

  componentWillUnmount = () => {
    this.props.unsubscribeFromFocusChange();

    this.connectionChecker.unsubscribe();
  }

  scheduleConnectionCheck = formValues => {
    const { endpoint } = formValues;

    // omit auth if auth options aren't set yet - done due to default authType set to HTTP Basic
    const endpointToCheck = this.state.isAuthNeeded ? endpoint : omit(endpoint, 'authType');

    this.connectionChecker.check(endpointToCheck);
  }

  handleConnectionCheckResult = result => {
    const { connectionResult, endpointErrors } = result;

    if (endpointErrors) {
      return this.setConnectionState({ type: CONNECTION_STATE.INVALID_ENDPOINT, endpointErrors });
    }

    if (!connectionResult.success) {
      if (this.isAuthError(connectionResult)) {
        this.setState({ isAuthNeeded: true });
      }

      return this.setConnectionState({
        type: CONNECTION_STATE.ERROR,
        code: connectionResult.code,
        details: connectionResult.details
      });
    }

    return this.setConnectionState({ type: CONNECTION_STATE.CONNECTED });
  }

  isAuthError(result) {
    return [ ApiErrors.UNAUTHORIZED, ApiErrors.FORBIDDEN ].includes(result.code);
  }

  setConnectionState(connectionState) {
    this.setState({ connectionState });
  }

  isConnectionError(code) {
    return code === ApiErrors.NOT_FOUND || code === ApiErrors.CONNECTION_FAILED ||
      code === ApiErrors.NO_INTERNET_CONNECTION;
  }

  onAppFocusChange = () => {

    // User may fix connection related errors by focusing out from app (turn on wifi, start server etc.)
    // In that case we want to check if errors are fixed when the users focuses back on to the app.
    // this.scheduleConnectionCheck();
  }

  onClose = (action = 'cancel', data = null) => {
    this.props.onClose(action, data);
  }

  onSubmit = async (values, { setSubmitting }) => {
    const {
      endpoint
    } = values;

    // omit auth if auth options aren't set yet - done due to default authType set to HTTP Basic
    const endpointToCheck = this.state.isAuthNeeded ? endpoint : omit(endpoint, 'authType');

    const { connectionResult } = await this.connectionChecker.check(endpointToCheck);

    if (!connectionResult.success) {
      return setSubmitting(false);
    }

    this.onClose('deploy', values);
  }

  fieldError = (meta) => {
    return meta.error;
  }

  endpointConfigurationFieldError = (meta, fieldName) => {
    return this.getConnectionError(fieldName) || meta.error;
  }

  getConnectionError(rawFieldName) {
    const { connectionState } = this.state;

    // no connection error
    if (connectionState.type !== CONNECTION_STATE.ERROR) {
      return;
    }

    const fieldName = rawFieldName.replace('endpoint.', '');
    const { code, details } = connectionState;

    switch (code) {
    case ApiErrors.UNAUTHORIZED:
    case ApiErrors.FORBIDDEN:
      return [ 'username', 'password', 'token' ].includes(fieldName) && details;
    default:
      return fieldName === 'url' && details;
    }
  }

  render() {

    const {
      endpointConfigurationFieldError,
      fieldError,
      onSubmit,
      onClose
    } = this;

    const {
      configuration: values,
      validator,
      title,
      intro,
      primaryAction
    } = this.props;

    const {
      isAuthNeeded
    } = this.state;

    return (
      <Modal className={ css.DeploymentConfigModal } onClose={ () => {
        onClose('cancel', null);
      } }>

        <Formik
          initialValues={ values }
          onSubmit={ onSubmit }
          validate={ this.scheduleConnectionCheck }
          validateOnMount
        >
          { form => (
            <Form>
              <Modal.Title>
                {
                  title || 'Deploy Diagram'
                }
              </Modal.Title>

              <Modal.Body>
                {
                  intro && (
                    <p className="intro">
                      { intro }
                    </p>
                  )
                }
                <fieldset>
                  <div className="fields">

                    <Field
                      name="deployment.name"
                      component={ TextInput }
                      label="Deployment Name"
                      fieldError={ fieldError }
                      validate={ validator.validateDeploymentName }
                      autoFocus
                    />

                    <Field
                      name="deployment.tenantId"
                      component={ TextInput }
                      fieldError={ fieldError }
                      hint="Optional"
                      label="Tenant ID"
                    />
                  </div>
                </fieldset>

                <fieldset>
                  <legend>
                    Endpoint Configuration
                  </legend>

                  <div className="fields">

                    <Field
                      name="endpoint.url"
                      component={ TextInput }
                      fieldError={ endpointConfigurationFieldError }
                      validate={ validator.validateEndpointURL }
                      label="REST Endpoint"
                      hint="Should point to a running Camunda Engine REST API endpoint."
                    />

                    {
                      isAuthNeeded && (
                        <Field
                          name="endpoint.authType"
                          label="Authentication"
                          component={ Radio }
                          values={
                            [
                              { value: AuthTypes.basic, label: 'HTTP Basic' },
                              { value: AuthTypes.bearer, label: 'Bearer token' }
                            ]
                          }
                        />
                      )
                    }

                    { isAuthNeeded && form.values.endpoint.authType === AuthTypes.basic && (
                      <React.Fragment>
                        <Field
                          name="endpoint.username"
                          component={ TextInput }
                          fieldError={ endpointConfigurationFieldError }
                          validate={ validator.validateUsername }
                          label="Username"
                        />

                        <Field
                          name="endpoint.password"
                          component={ TextInput }
                          fieldError={ endpointConfigurationFieldError }
                          validate={ validator.validatePassword }
                          label="Password"
                          type="password"
                        />
                      </React.Fragment>
                    )}

                    { isAuthNeeded && form.values.endpoint.authType === AuthTypes.bearer && (
                      <Field
                        name="endpoint.token"
                        component={ TextInput }
                        fieldError={ endpointConfigurationFieldError }
                        validate={ validator.validateToken }
                        label="Token"
                      />
                    )}

                    {
                      isAuthNeeded && (
                        <Field
                          name="endpoint.rememberCredentials"
                          component={ CheckBox }
                          type="checkbox"
                          label="Remember credentials"
                        />
                      )
                    }
                  </div>
                </fieldset>
              </Modal.Body>

              <Modal.Footer>
                <div className="form-submit">

                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={ () => {
                      onClose('cancel', null);
                    } }
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={ form.isSubmitting }
                  >
                    { primaryAction || 'Deploy' }
                  </button>

                </div>
              </Modal.Footer>
            </Form>
          )}
        </Formik>
      </Modal>
    );
  }
}
