import { Router, type IRouter } from "express";
import healthRouter from "./health";
import fanvpnRouter from "./fanvpn";

const router: IRouter = Router();

router.use(healthRouter);
router.use(fanvpnRouter);

export default router;
