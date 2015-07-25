'use strict';
var React     = require('react')
  , invariant = require('scoped-invariant')('react-formal')
  , reach     = require('yup/lib/util/reach')
  , expr      = require('property-expr')
  , updateIn  = require('./util/update')
  , Validator = require('react-input-message/lib/Validator')
  , Container = require('react-input-message/lib/MessageContainer')
  , uncontrollable = require('uncontrollable')
  , paths = require('./util/paths')
  , getChildren    = require('./util/parentContext');

let done = e => setTimeout(() => { throw e })

let getParent = path => expr.join(expr.split(path).slice(0, -1))

/**
 * Form component renders a `value` to be updated and validated by child Fields.
 * Forms can be thought of as `<input/>`s for complex values, or models. A Form aggregates
 * a bunch of smaller inputs, each in charge of updating a small part of the overall model.
 * The Form will integrate and validate each change and fire a single unified `onChange` with the new `value`.
 *
 * Validation messages can be displayed anywhere inside a Form with Message Components.
 *
 * ```editable
 * var defaultStr = yup.string().default('')
 *   , modelSchema = yup.object({
 *       name: yup.object({
 *         first: defaultStr.required('please enter a first name'),
 *         last:  defaultStr.required('please enter a surname'),
 *       }),
 *
 *       dateOfBirth: yup.date()
 *         .max(new Date(), "You can't be born in the future!"),
 *
 *       colorId: yup.number().nullable()
 *         .required('Please select a color')
 *     });
 *
 * var form = (
 *   <Form
 *     schema={modelSchema}
 *     defaultValue={modelSchema.default()}
 *   >
 *     <div> {\/\*'grandchildren' are no problem \*\/}
 *       <label>Name</label>
 *
 *       <Form.Field name='name.first' placeholder='First name'/>
 *       <Form.Field name='name.last' placeholder='Surname'/>
 *
 *       <Form.Message for={['name.first', 'name.last']}/>
 *     </div>
 *
 *     <label>Date of Birth</label>
 *     <Form.Field name='dateOfBirth'/>
 *     <Form.Message for='dateOfBirth'/>
 *
 *     <label>Favorite Color</label>
 *     <Form.Field name='colorId' type='select'>
 *       <option value={null}>Select a color...</option>
 *       <option value={0}>Red</option>
 *       <option value={1}>Yellow</option>
 *       <option value={2}>Blue</option>
 *       <option value={3}>other</option>
 *     </Form.Field>
 *     <Form.Message for='colorId'/>
 *
 *   <Form.Button type='submit'>Submit</Form.Button>
 * </Form>)
 * React.render(form, mountNode);
 * ```
 */
class Form extends React.Component {

  static propTypes = {

    /**
     * Form value object, can be left [uncontrolled](/controllables);
     * use the `defaultValue` prop to initialize an uncontrolled form.
     */
    value: React.PropTypes.object,

    /**
     * Callback that is called when the `value` prop changes.
     */
    onChange: React.PropTypes.func,

    /**
     * An object hash of field errors for the form. The object should be keyed with paths
     * with the values being string messages or an array of messages. Errors can be
     * left [uncontrolled](/controllables) (use `defaultErrors` to set an initial value)
     * or managed along with the `onError` callback.
     *
     * ```js
     * <Form errors={{
     *  "name.first": [
     *    'First names are required',
     *    "Names must be at least 2 characters long"
     *  ],
     * }}/>
     * ```
     */
    errors: React.PropTypes.object,

    /**
     * Callback that is called when a validation error occurs. It is called with an `errors` object
     *
     * ```editable
     * <Form schema={modelSchema}
     *   defaultValue={modelSchema.default()}
     *   errors={this.state ? this.state.errors : {}}
     *   onError={errors => {
     *     if( errors.dateOfBirth )
     *       errors.dateOfBirth = 'hijacked!'
     *     this.setState({ errors })
     *   }}>
     *
     *   <Form.Field name='dateOfBirth'/>
     *   <Form.Message for='dateOfBirth'/>
     *
     *   <Form.Button type='submit'>Submit</Form.Button>
     * </Form>
     * ```
     */
    onError: React.PropTypes.func,

    /**
     * Callback that is called whenever a validation is triggered.
     * It is called _before_ the validation is actually run.
     * ```js
     * function onError(e){
     *   { event, field, args, target } = e
     * }
     * ```
     */
    onValidate: React.PropTypes.func,

    /**
     * Callback that is fired when the native onSubmit event is triggered. Only relevant when
     * the `component` prop renders a `<form/>` tag. onSubmit will trigger only if the form is valid.
     *
     * ```js
     * function onSubmit(e){
     *   // do something with valid value
     * }
     * ```
     */
    onSubmit: React.PropTypes.func,

    /**
     * A value getter function. `getter` is called with `path` and `value` and
     * should return the plain **javascript** value at the path.
      * ```js
     * function(
     *  path: string,
     *  value: any,
     * ) -> object
     * ```
     */
    getter: React.PropTypes.func,

    /**
     * A value setter function. `setter` is called with `path`, the form `value` and the path `value`.
     * The `setter` must return updated form `value`, which allows you to leave the original value unmutated.
     *
     * The default implementation uses the [react immutability helpers](http://facebook.github.io/react/docs/update.html),
     * letting you treat the form `value` as immutable.
     * ```js
     * function(
     *  path: string,
     *  formValue: object,
     *  pathValue: any
     * ) -> object
     * ```
     */
    setter: React.PropTypes.func.isRequired,

    /**
     * Time in milliseconds that validations should be debounced. Reduces the amount of validation calls
     * made at the expense of a slight delay. Helpful for performance.
     */
    delay: React.PropTypes.number,

    /**
     * Validations will be strict, making no attempt to coarce input values to the appropriate type.
     */
    strict: React.PropTypes.bool,

    /**
     * Turns off input validation for the Form, value updates will continue to work.
     */
    noValidate: React.PropTypes.bool,

    /**
     * A tag name or Component class the Form should render as
     */
    component: React.PropTypes.oneOfType([
      React.PropTypes.func,
      React.PropTypes.string
    ]).isRequired,

    /**
     * A Yup schema  that validates the Form `value` prop. Used to validate the form input values
     * For more information about the yup api check out: https://github.com/jquense/yup/blob/master/README.md
     * @type {YupSchema}
     */
    schema(props, name, componentName) {
      var err = !props.noValidate && React.PropTypes.any.isRequired(props, name, componentName)

      if (props[name] && !props[name].__isYupSchema__)
        err = new Error('`schema` must be a proper yup schema: (' + componentName + ')')

      return err
    }
  }

  static defaultProps = {
    component: 'form',
    strict: true,
    delay: 300,
    getter: (path, model) => path ? expr.getter(path, true)(model || {}) : model,
    setter: (path, model, val) => updateIn(model, path, val)
  }

  static childContextTypes = {
    schema:     React.PropTypes.func,
    value:      React.PropTypes.func,
    onChange:   React.PropTypes.func,
    onSubmit:   React.PropTypes.func,
    noValidate: React.PropTypes.func
  }

  constructor(props, context){
    super(props, context)

    this.validator = new Validator((path, { props, options }) => {
      var model   = props.value
        , schema  = reach(props.schema, path)
        , value   = props.getter(path, model)
        , parent = props.getter(getParent(path), model) || {};

      return schema
        ._validate(value, { ...props, ...options }, { parent, path })
        .then(() => void 0)
        .catch(err => err.errors)
    })

    syncErrors(this.validator, props.errors || {})

    this.state = {
      children: getChildren(
            this.props.children
          , this.getChildContext())
    }
  }

  componentWillUnmount() {
    var timers = this._timers || {};

    this._unmounted = true;
    for (var k in timers) if ( has(timers, k) )
      clearTimeout(timers[k])
  }

  componentWillReceiveProps(nextProps){
    if ( nextProps.schema !== this.props.schema ){
      this._queueValidation({
        fields: uniq((this._queue || []).concat(Object.keys(nextProps.errors || {})))
      })
    }

    syncErrors(this.validator, nextProps.errors || {})

    this._flushValidations(nextProps)

    this.setState({
      children: getChildren(
          nextProps.children
        , this.getChildContext())
    })
  }

  getChildContext() {

    return this._context || (this._context = {

      noValidate: ()=> this.props.noValidate,

      schema:   path => path && this.props.schema && reach(this.props.schema, path),

      value:    path => this.props.getter(path, this.props.value),

      onChange: (path, updates, val) => this._update(path, val, updates)
    })
  }

  _update(path, widgetValue, mapValue){
    var model = this.props.value
      , updater = this.props.setter;

    if ( process.env.NODE_ENV !== 'production' )
      updater = wrapSetter(updater)

    if (typeof mapValue === 'function')
      model = updater(path, model, mapValue(widgetValue))

    else if (mapValue){
      for( var key in mapValue ) if ( mapValue.hasOwnProperty(key))
        model = updater(key, model, getValue(widgetValue, key, mapValue))
    }
    else
      model = updater(path, model, widgetValue)

    this.notify('onChange', model)

    function getValue(val, key, map){
      let field = map[key]
      return typeof field === 'function' ? field(val) : val[field]
    }
  }

  render() {
    var {
        children
      , onChange
      , value
      , component: Element
      , ...props } = this.props;

    if ( Element === 'form')
      props.noValidate = true // disable html5 validation

    return (
      <Container
        ref={ref => this._container = ref}
        messages={this.props.errors}
        onValidationNeeded={this.props.noValidate ? ()=> {} : e => this._handleValidationRequest(e)}>

        <Element {...props} onSubmit={this._submit.bind(this)}>
          { this.state.children }
        </Element>
      </Container>
    );
  }

  _handleValidationRequest(e) {
    this.notify('onValidate', e)
    return e.event === 'onChange'
      ? this._queueValidation(e)
      : this._processValidationRequest(e, this.props)
  }

  _processValidationRequest(e, props){
    var fields = paths.reduce(e.fields)
      , options = e.target ? e.target.props.options : {};

    this.timeout(fields.join('-'), () => {
      this.validator
        .validate(fields, { props, options })
        .then(() => {
          var errors = this.validator.errors();
          this.notify('onError', errors)
        })
        .catch(done)

    }, this.props.delay)
  }

  _submit(e){
    var { schema, value, ...options } = this.props

    options.abortEarly = false

    e.preventDefault()

    schema
      .validate(value, options)
      .then(() => this.notify('onSubmit', e))
      .catch(err => {
        var errors = err.inner.reduce((list, e) => {
          list[e.path] = (list[e.path] || (list[e.path] = [])).concat(e.errors)
          return list
        }, {})

        this.notify('onError', errors)
      })
  }

  timeout(key, fn, ms){
    this._timers || (this._timers = Object.create(null));

    if ( this._unmounted) return

    clearTimeout(this._timers[key])
    this._timers[key] = setTimeout(fn, ms)
  }

  _queueValidation(e){
    var queue = this._queue || (this._queue = [])

    //if ( !queue.some( q => q.path === e.path) )
    queue.push(e)
  }

  _flushValidations(props){
    var requests = this._queue || [];

    this._queue = [];

    requests
      .forEach( r => this._processValidationRequest(r, props))
  }

  notify(event, arg){
    this.props[event] && this.props[event](arg)
  }
}

module.exports = uncontrollable(Form, { value: 'onChange', errors: 'onError' })

function wrapSetter(setter){
  return (...args) => {
    var result = setter(...args)
    invariant(result && typeof result === 'object',
      '`setter(..)` props must return the form value object after updating a value.')
    return result
  }
}

function uniq(arr){
  return arr.filter((item, i) => arr.indexOf(item) === i)
}

function syncErrors(validator, errors){
  validator._errors = {}
  Object.keys(errors).forEach(key => {
    if ( errors[key] != null)
      validator._errors[key] = [].concat(errors[key])
  })
}

function has(o, k){
  return o ? Object.prototype.hasOwnProperty.call(o, k) : false
}
