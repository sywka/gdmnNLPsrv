import ProgressBar from "Progress";
import Timer = NodeJS.Timer;

export default class Progress {

    private _progressBar: ProgressBar;
    private _reRenderInterval: Timer;

    constructor(total: number = 10, hidden?: boolean) {
        if (!hidden) {/* :current/:total */
            this._progressBar = new ProgressBar("[:bar] (:percent :elapseds) :message", {
                complete: "▇",
                incomplete: "-",
                // stream: process.stdout,
                width: 40,
                total
            });
            this._startReRender();
        }
    }

    public tick(message: string, count?: number): void {
        if (!this._progressBar) return;

        this.message(message);
        this._progressBar.tick(count);
    }

    public message(message: string = ""): void {
        if (!this._progressBar) return;

        this._progressBar.render({message});
    }

    public terminate(message: string): void {
        if (!this._progressBar) return;

        this._clearReRender();
        this._progressBar.render({message});
        this._progressBar.terminate();
    }

    private _startReRender(): void {
        if (!this._progressBar) return;

        this._reRenderInterval = setInterval(() => {
            if (this._progressBar.complete) {
                this._clearReRender();
            } else this._progressBar.render();
        }, 500);
    }

    private _clearReRender(): void {
        if (!this._progressBar) return;

        clearInterval(this._reRenderInterval);
        this._reRenderInterval = null;
    }
}