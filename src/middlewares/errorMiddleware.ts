import {NextFunction, Request, Response} from "express";
import http from "http";

export enum ResponseType {
    JSON = 1,
    HTML = 2
}

export enum ErrorCode {
    UNKNOWN_ERROR_CODE = 1,
    CUSTOM_ERROR_CODE = 2,
    INVALID_ERROR_CODE = 3,
    NOT_FOUND_ERROR_CODE = 4,
    ACCESS_DENIED_ERROR_CODE = 5
}

export function getErrorMiddleware() {
    return (err: any, req: Request, res: Response, next: NextFunction) => {
        if (!(err instanceof HttpError)) {
            err = new HttpError(ResponseType.HTML, 500, err);
        }
        if (!(err.cause instanceof CodeError)) {
            let nErr = new CodeError(ErrorCode.UNKNOWN_ERROR_CODE, "Unknown error");
            nErr.stack = err.cause.stack;
            err.cause = nErr;
        }

        console.error(err);

        res.status(err.code);
        res.statusMessage = err.message;

        if (process.env.NODE_ENV) {
            delete err.cause.stack;
        }
        switch (err.responseFormat) {
            case ResponseType.JSON: {
                return res.send({
                    errorCode: err.cause.code,
                    errorMessage: err.cause.message,
                    ...err.cause.data,
                    stack: err.cause.stack
                });
            }
            case ResponseType.HTML:
            default: {
                return res.render("error", {
                    status: err.code,
                    statusMessage: err.message,
                    error: err.cause
                });
            }
        }
    };
}

export class CodeError extends Error {

    public code: ErrorCode;
    public data: any;

    constructor(code: ErrorCode, message: string, data?: any) {
        super(message);
        this.code = code;
        this.message = message;
        this.data = data;

        Object.setPrototypeOf(this, CodeError.prototype);
    }
}

export class HttpError extends CodeError {

    public responseFormat: ResponseType;
    public cause: Error;

    constructor(responseFormat: ResponseType, status: number, cause?: Error, data?: any) {
        super(status, http.STATUS_CODES[status] || http.STATUS_CODES[500], data);
        this.responseFormat = responseFormat;
        this.cause = cause;

        Object.setPrototypeOf(this, HttpError.prototype);
    }
}