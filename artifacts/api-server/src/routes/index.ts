import { Router, type IRouter } from "express";
import healthRouter from "./health";
import urbanRouter, { requireAuth } from "./urban";

const router: IRouter = Router();

router.use(healthRouter);
router.use(requireAuth);
router.use(urbanRouter);

export default router;
