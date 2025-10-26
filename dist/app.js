
!function(){try{var e="undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:{},n=(new e.Error).stack;n&&(e._sentryDebugIds=e._sentryDebugIds||{},e._sentryDebugIds[n]="e8ec82ee-dcf6-5d09-a132-f50b20cc77a7")}catch(e){}}();
import{MongoClient as p,ServerApiVersion as m}from"mongodb";import"@sentry/node";var s=null;async function t(){if(s)try{await s.close(),s=null,console.log(`
Database connection shut down`)}catch(o){throw console.error(`
Failed to shut down database connection`),o}}import r from"express";import c from"helmet";import{xss as i}from"express-xss-sanitizer";import*as a from"@sentry/node";process.on("SIGINT",async()=>{try{await t(),process.exit(0)}catch{process.exit(1)}});var e=r();e.use(r.urlencoded({extended:!1,limit:"1mb"}));e.use(c());e.use(i());e.post(process.env.APP_PATH,async(o,n)=>{n.status(200).send("Hello world!")});e.get(process.env.APP_PATH,(o,n)=>{n.status(200).send("GuiDo is up and running! (commit: <b>"+process.env.CURRENT_COMMIT+"</b>)")});a.setupExpressErrorHandler(e);e.listen(process.env.EXPRESS_PORT,()=>{console.log("GuiDo running on port",process.env.EXPRESS_PORT),process.send&&process.send("ready")});
//# sourceMappingURL=app.js.map

//# debugId=e8ec82ee-dcf6-5d09-a132-f50b20cc77a7
