import express from "express";

export default abstract class BaseRouter {

    constructor() {
        this._router = express.Router();
        this.routes(this._router);
    }

    private _router: express.Router;

    get router(): express.Router {
        return this._router;
    }

    protected abstract routes(router: express.Router);
}