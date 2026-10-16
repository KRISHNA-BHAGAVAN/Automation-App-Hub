import { Router, type IRouter } from "express";
import healthRouter from "./health";
import passwordResetRouter from "./password-reset";

const router: IRouter = Router();

router.use(healthRouter);
router.use(passwordResetRouter);

export default router;
