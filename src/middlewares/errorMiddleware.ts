import * as http from 'http'

export const JSON = 1;
export const HTML = 2;

export const UNKNOWN_ERROR_CODE = 1;
export const CUSTOM_ERROR_CODE = 2;
export const INVALID_ERROR_CODE = 3;
export const NOT_FOUND_ERROR_CODE = 4;
export const ACCESS_DENIED_ERROR_CODE = 5;

export function getErrorMiddleware() {
    return (err, req, res, next) => {
        if (!(err instanceof HttpError)) {
            err = new HttpError(HTML, 500, err);
            console.log(err);
        }
        if (!(err.cause instanceof CodeError)) {
            let nErr = new CodeError(UNKNOWN_ERROR_CODE, 'Unknown error');
            nErr.stack = err.cause.stack;
            err.cause = nErr;
        }

        res.status(err.code);
        res.statusMessage = err.message;

        if (process.env.NODE_ENV) {
            delete err.cause.stack;
        }
        switch (err.responseFormat) {
            case JSON: {
                return res.send({
                    errorCode: err.cause.code,
                    errorMessage: err.cause.message,
                    ...err.cause.data,
                    stack: err.cause.stack
                });
            }
            case HTML:
            default: {
                return res.render('error', {
                    status: err.code,
                    statusMessage: err.message,
                    error: err.cause
                });
            }
        }
    }
}

export class CodeError extends Error {

    public code: number;
    public data: any;

    constructor(code: number, message: string, data?: any) {
        super(message);
        this.code = code;
        this.message = message;
        this.data = data;

        Object.setPrototypeOf(this, CodeError.prototype);
    }
}

export class HttpError extends CodeError {

    public responseFormat: number;
    public cause: Error;

    constructor(responseFormat: number, code: number, cause?: Error, data?: any) {
        super(code, http.STATUS_CODES[code] || http.STATUS_CODES[500], data);
        this.responseFormat = responseFormat;
        this.cause = cause;

        Object.setPrototypeOf(this, HttpError.prototype);
    }
}