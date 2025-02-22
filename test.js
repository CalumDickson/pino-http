'use strict'

var test = require('tap').test
var http = require('http')
var pinoHttp = require('./')
var pino = require('pino')
var split = require('split2')

var ERROR_URL = '/make-error'
var noop = function () {}

function setup (t, logger, cb, handler) {
  var server = http.createServer(handler || function (req, res) {
    logger(req, res)
    if (req.url === '/') {
      res.end('hello world')
      return
    } else if (req.url === ERROR_URL) {
      res.statusCode = 500
      res.end('error')
      return
    }
    res.statusCode = 404
    res.end('Not Found')
  })

  server.listen(0, '127.0.0.1', function (err) {
    cb(err || null, server)
  })
  t.tearDown(function (cb) {
    server.close(cb)
  })

  return server
}

function doGet (server, path, callback) {
  path = path || '/'
  var address = server.address()
  var cb = callback || noop
  return http.get('http://' + address.address + ':' + address.port + path, cb)
}

test('default settings', function (t) {
  var dest = split(JSON.parse)
  var logger = pinoHttp(dest)

  setup(t, logger, function (err, server) {
    t.error(err)
    doGet(server)
  })

  dest.on('data', function (line) {
    t.ok(line.req, 'req is defined')
    t.ok(line.res, 'res is defined')
    t.equal(line.msg, 'request completed', 'message is set')
    t.equal(line.req.method, 'GET', 'method is get')
    t.equal(line.res.statusCode, 200, 'statusCode is 200')
    t.end()
  })
})

test('stream in options', function (t) {
  var dest = split(JSON.parse)
  var logger = pinoHttp({ stream: dest })

  setup(t, logger, function (err, server) {
    t.error(err)
    doGet(server)
  })

  dest.on('data', function (line) {
    t.ok(line.req, 'req is defined')
    t.ok(line.res, 'res is defined')
    t.equal(line.msg, 'request completed', 'message is set')
    t.equal(line.req.method, 'GET', 'method is get')
    t.equal(line.res.statusCode, 200, 'statusCode is 200')
    t.end()
  })
})

test('exposes the internal pino', function (t) {
  t.plan(1)

  var dest = split(JSON.parse)
  var logger = pinoHttp(dest)

  dest.on('data', function (line) {
    t.equal(line.msg, 'hello world')
  })

  logger.logger.info('hello world')
})

test('uses the log level passed in as an option', function (t) {
  var dest = split(JSON.parse)
  var logger = pinoHttp({ useLevel: 'debug', level: 'debug' }, dest)

  setup(t, logger, function (err, server) {
    t.error(err)
    doGet(server)
  })

  dest.on('data', function (line) {
    t.equal(line.level, 20, 'level')
    t.notOk(line.useLevel, 'useLevel not forwarded')
    t.end()
  })
})

test('uses the custom log level passed in as an option', function (t) {
  var dest = split(JSON.parse)
  var logger = pinoHttp({ customLogLevel: function (res, err) {
    return 'warn'
  }}, dest)

  setup(t, logger, function (err, server) {
    t.error(err)
    doGet(server)
  })

  dest.on('data', function (line) {
    t.equal(line.level, 40, 'level')
    t.notOk(line.customLogLevel, 'customLogLevel not forwarded')
    t.end()
  })
})

test('throw error if custom log level and log level passed in together', function (t) {
  var dest = split(JSON.parse)
  var throwFunction = function () {
    pinoHttp({
      useLevel: 'info',
      customLogLevel: function (res, err) {
        return 'warn'
      }}, dest)
  }
  t.throws(throwFunction, {message: "You can't pass 'useLevel' and 'customLogLevel' together"})
  t.end()
})

test('allocate a unique id to every request', function (t) {
  t.plan(5)

  var dest = split(JSON.parse)
  var logger = pinoHttp(dest)
  var lastId = null

  setup(t, logger, function (err, server) {
    t.error(err)
    doGet(server)
    doGet(server)
  })

  dest.on('data', function (line) {
    t.notEqual(line.req.id, lastId)
    lastId = line.req.id
    t.ok(line.req.id, 'req.id is defined')
  })
})

test('uses a custom genReqId function', function (t) {
  t.plan(4)

  var dest = split(JSON.parse)
  var idToTest
  function genReqId (req) {
    t.ok(req.url, 'The first argument must be the request parameter')
    idToTest = (Date.now() + Math.random()).toString(32)
    return idToTest
  }

  var logger = pinoHttp({genReqId: genReqId}, dest)
  setup(t, logger, function (err, server) {
    t.error(err)
    doGet(server)
  })

  dest.on('data', function (line) {
    t.equal(typeof line.req.id, 'string')
    t.equal(line.req.id, idToTest)
  })
})

test('reuses existing req.id if present', function (t) {
  t.plan(2)

  var dest = split(JSON.parse)
  var logger = pinoHttp(dest)
  var someId = 'id-to-reuse-12345'

  function loggerWithExistingReqId (req, res) {
    req.id = someId
    logger(req, res)
  }

  setup(t, loggerWithExistingReqId, function (err, server) {
    t.error(err)
    doGet(server)
  })

  dest.on('data', function (line) {
    t.equal(line.req.id, someId)
  })
})

test('startTime', function (t) {
  var dest = split(JSON.parse)
  var logger = pinoHttp(dest)
  var someStartTime = 56

  t.equal(typeof pinoHttp.startTime, 'symbol')

  function loggerWithStartTime (req, res) {
    res[pinoHttp.startTime] = someStartTime
    logger(req, res)
    t.equal(res[pinoHttp.startTime], someStartTime)
  }

  setup(t, loggerWithStartTime, function (err, server) {
    t.error(err)
    doGet(server)
  })

  dest.on('data', function (line) {
    t.equal(typeof line.responseTime, 'number')
    t.end()
  })
})

test('responseTime', function (t) {
  var dest = split(JSON.parse)
  var logger = pinoHttp(dest)

  setup(t, logger, function (err, server) {
    t.error(err)
    doGet(server)
  })

  dest.on('data', function (line) {
    t.ok(line.responseTime >= 0, 'responseTime is defined')
    t.end()
  })
})

test('responseTime for errored request', function (t) {
  var dest = split(JSON.parse)
  var logger = pinoHttp(dest)

  setup(t, logger, function (err, server) {
    t.error(err)
    doGet(server, ERROR_URL)
  })

  dest.on('data', function (line) {
    t.ok(line.responseTime >= 0, 'responseTime is defined')
    t.end()
  })
})

test('responseTime for request emitting error event', function (t) {
  var dest = split(JSON.parse)
  var logger = pinoHttp(dest)

  function handle (req, res) {
    logger(req, res)
    res.emit('error', new Error('Some error'))
    res.end()
  }

  setup(t, logger, function (err, server) {
    t.error(err)
    doGet(server)
  }, handle)

  dest.on('data', function (line) {
    t.ok(line.responseTime >= 0, 'responseTime is defined')
    t.end()
  })
})

test('no auto logging with autoLogging set to false', function (t) {
  var dest = split(JSON.parse)
  var logger = pinoHttp({ autoLogging: false }, dest)

  setup(t, logger, function (err, server) {
    t.error(err)
    doGet(server, null, function () {
      var line = dest.read()
      t.equal(line, null)
      t.end()
    })
  })
})

test('no auto logging with autoLogging set to true and path ignored', function (t) {
  var dest = split(JSON.parse)
  var logger = pinoHttp({
    autoLogging: {
      ignorePaths: ['/ignorethis']
    }
  }, dest)

  setup(t, logger, function (err, server) {
    t.error(err)
    doGet(server, '/ignorethis', function () {
      var line = dest.read()
      t.equal(line, null)
      t.end()
    })
  })
})

test('auto logging with autoLogging set to true and path not ignored', function (t) {
  var dest = split(JSON.parse)
  var logger = pinoHttp({
    autoLogging: {
      ignorePaths: ['/ignorethis']
    }
  }, dest)

  setup(t, logger, function (err, server) {
    t.error(err)
    doGet(server, '/shouldlogthis')
  })

  dest.on('data', function (line) {
    t.pass('path should log')
    t.end()
  })
})

test('no auto logging with autoLogging set to true and getPath result is ignored', function (t) {
  var dest = split(JSON.parse)
  var logger = pinoHttp({
    autoLogging: {
      ignorePaths: ['/ignorethis'],
      getPath: function (req) {
        return req.url
      }
    }
  }, dest)

  setup(t, logger, function (err, server) {
    t.error(err)
    doGet(server, '/ignorethis', function () {
      var line = dest.read()
      t.equal(line, null)
      t.end()
    })
  })
})

test('auto logging with autoLogging set to true and getPath result is not ignored', function (t) {
  var dest = split(JSON.parse)
  var logger = pinoHttp({
    autoLogging: {
      ignorePaths: ['/ignorethis'],
      getPath: function (req) {
        return req.url
      }
    }
  }, dest)

  setup(t, logger, function (err, server) {
    t.error(err)
    doGet(server, '/shouldlogthis')
  })

  dest.on('data', function (line) {
    t.pass('path should log')
    t.end()
  })
})

test('support a custom instance', function (t) {
  var dest = split(JSON.parse)
  var logger = pinoHttp({
    logger: pino(dest)
  })

  setup(t, logger, function (err, server) {
    t.error(err)
    doGet(server)
  })

  dest.on('data', function (line) {
    t.ok(line.req, 'req is defined')
    t.ok(line.res, 'res is defined')
    t.equal(line.msg, 'request completed', 'message is set')
    t.equal(line.req.method, 'GET', 'method is get')
    t.equal(line.res.statusCode, 200, 'statusCode is 200')
    t.end()
  })
})

test('support a custom instance with custom genReqId function', function (t) {
  var dest = split(JSON.parse)

  var idToTest
  function genReqId (req) {
    t.ok(req.url, 'The first argument must be the request parameter')
    idToTest = (Date.now() + Math.random()).toString(32)
    return idToTest
  }

  var logger = pinoHttp({
    logger: pino(dest),
    genReqId: genReqId
  })

  setup(t, logger, function (err, server) {
    t.error(err)
    doGet(server)
  })

  dest.on('data', function (line) {
    t.ok(line.req, 'req is defined')
    t.ok(line.res, 'res is defined')
    t.notOk(line.genReqId)
    t.equal(line.msg, 'request completed', 'message is set')
    t.equal(line.req.method, 'GET', 'method is get')
    t.equal(line.res.statusCode, 200, 'statusCode is 200')
    t.end()
  })
})

test('does not crash when no request connection object', function (t) {
  var dest = split(JSON.parse)
  var logger = pinoHttp({
    logger: pino(dest)
  })
  t.plan(1)

  var server = http.createServer(handler)
  server.unref()
  server.listen(9999, () => {
    http.get('http://127.0.0.1:9999', (res) => {
      t.pass('made it through logic path without crashing')
    })
  })

  function handler (req, res) {
    delete req.connection
    logger(req, res)
    res.end()
  }
})

// https://github.com/pinojs/pino-http/issues/42
test('does not return excessively long object', function (t) {
  var dest = split(JSON.parse)
  var logger = pinoHttp({
    logger: pino(dest),
    serializers: {
      req: function (req) {
        delete req.connection
        return req
      }
    }
  })
  t.plan(1)

  var server = http.createServer(handler)
  server.unref()
  server.listen(0, () => {
    http.get(server.address(), () => {})
  })

  function handler (req, res) {
    logger(req, res)
    res.end()
  }

  dest.on('data', function (obj) {
    t.is(Object.keys(obj.req).length, 6)
  })
})

test('err.raw is available to custom serializers', function (t) {
  t.plan(1)
  const error = new Error('foo')
  const dest = split(JSON.parse)
  const logger = pinoHttp({
    logger: pino(dest),
    serializers: {
      err (err) {
        t.equal(err.raw, error)
      }
    }
  })

  const server = http.createServer((req, res) => {
    logger(req, res)
    res.err = error
    res.end()
  })
  server.unref()
  server.listen(0, () => {
    http.get(server.address(), () => {})
  })
})

test('req.raw is available to custom serializers', function (t) {
  t.plan(2)
  var dest = split(JSON.parse)
  var logger = pinoHttp({
    logger: pino(dest),
    serializers: {
      req: function (req) {
        t.ok(req.raw)
        t.ok(req.raw.connection)
        return req
      }
    }
  })

  var server = http.createServer(handler)
  server.unref()
  server.listen(0, () => {
    http.get(server.address(), () => {})
  })

  function handler (req, res) {
    logger(req, res)
    res.end()
  }
})

test('res.raw is available to custom serializers', function (t) {
  t.plan(2)
  var dest = split(JSON.parse)
  var logger = pinoHttp({
    logger: pino(dest),
    serializers: {
      res: function (res) {
        t.ok(res.raw)
        t.ok(res.raw.statusCode)
        return res
      }
    }
  })

  var server = http.createServer(handler)
  server.unref()
  server.listen(0, () => {
    http.get(server.address(), () => {})
  })

  function handler (req, res) {
    logger(req, res)
    res.end()
  }
})

test('res.raw is not enumerable', function (t) {
  t.plan(1)
  var dest = split(JSON.parse)
  var logger = pinoHttp({
    logger: pino(dest),
    serializers: {
      res: function (res) {
        t.is(res.propertyIsEnumerable('raw'), false)
        return res
      }
    }
  })

  var server = http.createServer(handler)
  server.unref()
  server.listen(0, () => {
    http.get(server.address(), () => {})
  })

  function handler (req, res) {
    logger(req, res)
    res.end()
  }
})

test('req.id has a non-function value', function (t) {
  t.plan(1)
  var dest = split(JSON.parse)
  var logger = pinoHttp({
    logger: pino(dest),
    serializers: {
      req: function (req) {
        t.is(typeof req.id === 'function', false)
        return req
      }
    }
  })

  var server = http.createServer(handler)
  server.unref()
  server.listen(0, () => {
    http.get(server.address(), () => {})
  })

  function handler (req, res) {
    logger(req, res)
    res.end()
  }
})

test('uses the custom successMessage callback if passed in as an option', function (t) {
  var dest = split(JSON.parse)
  var customResponseMessage = 'Custom response message'
  var logger = pinoHttp({ customSuccessMessage: function () {
    return customResponseMessage
  }}, dest)

  setup(t, logger, function (err, server) {
    t.error(err)
    doGet(server)
  })

  dest.on('data', function (line) {
    t.equal(line.msg, customResponseMessage)
    t.end()
  })
})

test('uses the custom errorMessage callback if passed in as an option', function (t) {
  var dest = split(JSON.parse)
  var customErrorMessage = 'Custom error message'
  var logger = pinoHttp({ customErrorMessage: function () {
    return customErrorMessage
  }}, dest)

  setup(t, logger, function (err, server) {
    t.error(err)
    doGet(server, ERROR_URL)
  })

  dest.on('data', function (line) {
    t.equal(line.msg, customErrorMessage)
    t.end()
  })
})
