const appE = document.getElementById('root');
let rafId = undefined;
class Context {
    constructor() {
        this.fn = {};
        this.refs = new Map;
    }
}
let ctx = new Context;
function renderSpine(ws, spine) {
    if (rafId === undefined) {
        cancelAnimationFrame(rafId);
    }
    rafId = requestAnimationFrame(() => {
        // console.time('spineToReact');
        const rootElement = spineToReact(ws, [], ctx, spine, undefined);
        // console.timeEnd('spineToReact');
        // console.time('ReactDOM.render');
        ReactDOM.render(rootElement, appE);
        // console.timeEnd('ReactDOM.render');
        rafId = undefined;
    });
}
class Dots extends React.Component {
    constructor(props) {
        super(props);
        this.dots = [];
        this.dotElements = Array.from(Array(5)).map((_, i) => {
            const ref = el => this.dots[i] = el;
            return React.createElement('div', { ref, className: 'dot' }, React.createElement('div', { className: 'gfx' }));
        });
        this.updateScale = () => {
            this.rafId = requestAnimationFrame(this.updateScale);
            this.dots.forEach(dot => {
                const bounds = dot.getBoundingClientRect();
                const scale = this.dots.reduce((scale, otherDot) => {
                    if (dot === otherDot) {
                        return scale;
                    }
                    else {
                        const otherBounds = otherDot.getBoundingClientRect();
                        const dx = bounds.left - otherBounds.left;
                        const dy = bounds.top - otherBounds.top;
                        const distance = Math.sqrt((dx * dx) + (dy * dy));
                        const max = 20;
                        const p = Math.max(0, (max - distance) / max);
                        return scale + (1.5 - scale) * 0.4 * p;
                    }
                }, 1);
                dot.childNodes[0].style.transform = `scale(${scale})`;
            });
        };
    }
    componentDidMount() {
        this.updateScale();
    }
    componentWillUnmount() {
        cancelAnimationFrame(this.rafId);
    }
    render() {
        return React.createElement('div', { className: 'dots' }, ...this.dotElements);
    }
}
const loadingScreenElement = React.createElement('div', { className: 'loadingScreen' }, React.createElement(Dots));
function loadingScreen() {
    ReactDOM.render(loadingScreenElement, appE);
}
function runClient() {
    const ws = new WebSocket('ws://localhost:8000');
    ws.addEventListener('message', msg => {
        // console.time('JSON.parse');
        const data = JSON.parse(msg.data);
        // console.timeEnd('JSON.parse');
        renderSpine(ws, data);
    });
    ws.addEventListener('close', ev => {
        componentRegistry = new Map;
        ctx = new Context;
        loadingScreen();
        // console.log(ev);
        runClient();
    });
    ws.addEventListener('error', ev => {
        componentRegistry = new Map;
        ctx = new Context;
        loadingScreen();
        // console.log(ev);
        // runClient();
    });
}
let componentRegistry = new Map;
function getComponent(componentId) {
    let component = componentRegistry.get(componentId);
    if (component === undefined) {
        component = class extends React.Component {
            constructor(props) {
                super(props);
                this.ctx = new Context;
            }
            componentDidMount() {
                const { ws, path, spine: { eventListeners, hooks: { componentDidMount } } } = this.props;
                componentDidMount.forEach(exp => {
                    ws.send(JSON.stringify(['hook', path, evalExp(exp, {}, this.ctx)]));
                });
                eventListeners.forEach(([fid, name, expr]) => {
                    window.addEventListener(name, getFn(this.ctx, path, fid, () => {
                        console.log('componentEventListeners', fid, name);
                        return ev => {
                            const eh = evalExp(expr, { '0': ev }, this.ctx);
                            eh.preventDefault && ev.preventDefault();
                            eh.stopPropagation && ev.stopPropagation();
                            eh.stopImmediatePropagation && ev.stopImmediatePropagation();
                            if (eh.action) {
                                ws.send(JSON.stringify(['action', path, name, eh.action]));
                            }
                        };
                    }));
                });
            }
            componentWillUnmount() {
                const { ws, path, spine: { eventListeners, hooks: { componentWillUnmount } } } = this.props;
                componentWillUnmount.forEach(exp => {
                    ws.send(JSON.stringify(['hook', path, evalExp(exp, {}, this.ctx)]));
                });
                eventListeners.forEach(([fid, name, expr]) => {
                    window.removeEventListener(name, getFn(this.ctx, path, fid, () => {
                        return () => undefined;
                    }));
                });
            }
            render() {
                const { ws, path, spine, key } = this.props;
                return spineToReact(ws, path, this.ctx, spine.spine, key);
            }
        }
        ;
        componentRegistry.set(componentId, component);
    }
    return component;
}
function capitalizeFirstLetter(string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
}
function evalExp(expr, holes, ctx) {
    switch (expr[0]) {
        case 'GlobalE':
            return window;
        case 'HoleE':
            return holes[expr[1]];
        case 'Value0E':
            return [expr[1]];
        case 'Value1E':
            return [expr[1], evalExp(expr[2], holes, ctx)];
        case 'Value2E':
            return [expr[1], evalExp(expr[2], holes, ctx), evalExp(expr[3], holes, ctx)];
        case 'LitE':
            return expr[1];
        case 'GetE':
            return evalExp(expr[2], holes, ctx)[evalExp(expr[1], holes, ctx)];
        case 'InvokeE':
            return evalExp(expr[2], holes, ctx)[evalExp(expr[1], holes, ctx)](...expr.splice(3).map(e => evalExp(e, holes, ctx)));
        case 'EventHandlerE':
            return {
                preventDefault: evalExp(expr[1], holes, ctx),
                stopPropagation: evalExp(expr[2], holes, ctx),
                stopImmediatePropagation: evalExp(expr[3], holes, ctx),
                action: evalExp(expr[4], holes, ctx),
            };
        case 'JustE':
            return evalExp(expr[1], holes, ctx);
        case 'NothingE':
            return undefined;
        case 'RefHandlerE':
            return {
                action: evalExp(expr[1], holes, ctx),
            };
        case 'DerefE':
            return ctx.refs.get(expr[1]);
    }
    throw new Error(`evalExp: unknown expression type ${expr[0]}`);
}
class ControlledInput extends React.Component {
    constructor(props) {
        super(props);
        this.state = { value: props.props.value || '' };
        this.onChange = ev => {
            this.setState({ value: ev.target.value });
            if (this.props.props.onChange) {
                this.props.props.onChange(ev);
            }
        };
    }
    componentWillReceiveProps(nextProps) {
        if (nextProps.props.value !== this.state.value) {
            this.setState({ value: nextProps.props.value });
        }
    }
    render() {
        return React.createElement(this.props.elementType, Object.assign({}, this.props.props, { value: this.state.value, onChange: this.onChange }), ...(this.props.children || []));
    }
}
function getFn(ctx, path, fid, mkFn) {
    const pathCtx = ctx.fn[path] !== undefined
        ? ctx.fn[path]
        : (ctx.fn[path] = {});
    return pathCtx[fid] !== undefined
        ? pathCtx[fid]
        : (pathCtx[fid] = mkFn());
}
function spineToReact(ws, path, ctx, spine, key) {
    if (typeof spine === 'string') {
        return spine;
    }
    else if (spine.type === 'Node') {
        const children = spine.children.map(([index, child]) => spineToReact(ws, [].concat(path, index), ctx, child, index));
        const props = { key, style: spine.style };
        spine.eventListeners.forEach(([fid, name, expr]) => {
            props[`on${capitalizeFirstLetter(name)}`] = getFn(ctx, path, fid, () => {
                console.log('getFn', fid, name);
                return ev => {
                    const eh = evalExp(expr, { '0': ev }, ctx);
                    eh.preventDefault && ev.preventDefault();
                    eh.stopPropagation && ev.stopPropagation();
                    eh.stopImmediatePropagation && ev.stopImmediatePropagation();
                    if (eh.action) {
                        ws.send(JSON.stringify(['action', path, name, eh.action]));
                    }
                };
            });
        });
        for (const [p, v] of spine.attributes) {
            props[p] = v;
        }
        if (spine.ref) {
            props.ref = getFn(ctx, path, 'ref', () => {
                console.log('getFn ref');
                return ref => {
                    if (ref === null) {
                        // spine.ref.detach;
                        if (spine.ref.key) {
                            ctx.refs.delete(spine.ref.key);
                        }
                        console.log('detach');
                        const r = evalExp(spine.ref.detach, { ['1']: ref }, this.ctx);
                        if (r.action) {
                            ws.send(JSON.stringify(['ref', path, r.action]));
                        }
                    }
                    else {
                        if (spine.ref.key) {
                            ctx.refs.set(spine.ref.key, ref);
                        }
                        console.log('attach');
                        const r = evalExp(spine.ref.attach, { ['1']: ref }, this.ctx);
                        if (r.action) {
                            ws.send(JSON.stringify(['ref', path, r.action]));
                        }
                    }
                };
            });
        }
        if (spine.tag === 'input') {
            return React.createElement(ControlledInput, {
                elementType: 'input', props: props
            }, ...children);
        }
        else {
            return React.createElement(spine.tag, props, ...children);
        }
    }
    else if (spine.type === 'Component') {
        return React.createElement(getComponent(spine.id), {
            ws, key, path, spine
        });
    }
    else {
        throw new Error('spineToReact: unexpected value: ' + spine);
    }
}
loadingScreen();
runClient();
