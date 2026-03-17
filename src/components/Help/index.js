import React from "react";
import { Card, Elevation, H3, H4, H5, Divider, Callout, Tag } from "@blueprintjs/core";
import "./Help.css";
import { wxqImageData, seqyuanImageData } from "./imageData";

const Help = () => {
  return (
    <div className="help-container">
      <div className="help-content">
        <H3>AnnoCluster 使用指南</H3>
        <p className="help-subtitle">
          单细胞RNA-seq聚类结果注释助手 - 帮助您系统化地为细胞群命名
        </p>

        <Divider />

        <Card elevation={Elevation.TWO} className="help-section">
          <H4>📋 软件概述</H4>
          <p>
            AnnoCluster 是一个专为生物学家设计的单细胞数据注释工具，<strong>无需编程基础</strong>即可完成细胞群的鉴定和命名。
            软件将复杂的编程工作抽象为可视化界面，让您专注于生物学解释。
          </p>
          <Callout intent="primary" icon="info-sign">
            <div style={{ lineHeight: "1.6" }}>
              <strong>适用人群：</strong>
              <ul style={{ marginTop: "8px", marginBottom: "0" }}>
                <li>无编程基础的研究者，可独立完成细胞群注释</li>
                <li>医生/生物学家，可校验和修改生信分析师的注释结果</li>
              </ul>
            </div>
          </Callout>
        </Card>

        <Card elevation={Elevation.TWO} className="help-section">
          <H4>🔄 标准注释流程</H4>

          <div className="workflow-step">
            <H5>
              <Tag intent="primary" large>步骤 1</Tag>
              <span className="step-title">整体浏览 (DimPlot)</span>
            </H5>
            <ul>
              <li>在UMAP/t-SNE图中观察所有细胞群的分布</li>
              <li>识别可能的双细胞(doublets)或低质量细胞群：
                <ul>
                  <li>位于两个细胞群之间的"桥接"群</li>
                  <li>细胞数量异常少的孤立群</li>
                </ul>
              </li>
            </ul>
          </div>

          <div className="workflow-step">
            <H5>
              <Tag intent="primary" large>步骤 2</Tag>
              <span className="step-title">确认marker特异性 (TopMarker + DotPlot)</span>
            </H5>
            <p><strong>这是最关键的步骤！</strong></p>
            <ul>
              <li><strong>TopMarker页面：</strong>查看每个细胞群的top差异表达基因</li>
              <li><strong>DotPlot页面：</strong>评估这些marker的特异性
                <ul>
                  <li>✓ 高特异性：仅在1-2个细胞群高表达 → 可用于命名</li>
                  <li>✗ 低特异性：在多个细胞群都有表达 → 需进一步检查（见步骤4）</li>
                </ul>
              </li>
            </ul>
            <Callout intent="warning" icon="warning-sign">
              <strong>注意：</strong>Top marker不一定都是好的细胞类型标志物，必须在DotPlot中验证特异性
            </Callout>
          </div>

          <div className="workflow-step">
            <H5>
              <Tag intent="primary" large>步骤 3</Tag>
              <span className="step-title">经典Marker搜索 (DimPlot + 基因表达)</span>
            </H5>
            <ul>
              <li>搜索已知的细胞类型标志基因</li>
              <li>在降维图上叠加基因表达，识别特异性表达的细胞群</li>
            </ul>
            <div className="example-box">
              <strong>常见细胞类型marker示例：</strong>
              <ul>
                <li><strong>T细胞：</strong>CD3D, CD3E, CD3G</li>
                <li><strong>B细胞：</strong>CD79A, CD79B, MS4A1 (CD20)</li>
                <li><strong>单核/巨噬细胞：</strong>CD14, CD68, LYZ</li>
                <li><strong>NK细胞：</strong>NKG7, GNLY, KLRD1</li>
                <li><strong>上皮细胞：</strong>EPCAM, KRT8, KRT18</li>
                <li><strong>内皮细胞：</strong>PECAM1 (CD31), VWF, CDH5</li>
                <li><strong>成纤维细胞：</strong>COL1A1, COL1A2, DCN</li>
              </ul>
            </div>
          </div>

          <div className="workflow-step">
            <H5>
              <Tag intent="primary" large>步骤 4</Tag>
              <span className="step-title">确认低质量或双细胞群 (VlnPlot)</span>
            </H5>
            <p>当步骤2发现marker特异性低时，检查以下特征：</p>

            <Callout intent="danger" icon="error">
              <strong>低质量细胞群特征：</strong>
              <ul>
                <li>nCount_RNA 和 nFeature_RNA 明显低于其他群</li>
                <li>percent.mt (线粒体基因比例) 明显高于其他群</li>
                <li>Top marker富集核糖体基因 (RPL*, RPS*) 或线粒体基因 (MT-*)</li>
                <li><strong>处理建议：</strong>标注为"Low Quality"或在导出时排除</li>
              </ul>
            </Callout>

            <Callout intent="warning" icon="warning-sign">
              <strong>双细胞(Doublets)特征：</strong>
              <ul>
                <li>同时高表达两种不同细胞类型的marker</li>
                <li>例如：同时表达T细胞marker (CD3D) 和B细胞marker (CD79A)</li>
                <li>nCount_RNA 和 nFeature_RNA 异常高（约为正常细胞的2倍）</li>
                <li><strong>处理建议：</strong>标注为"Doublets"或在导出时排除</li>
              </ul>
            </Callout>

            <Callout intent="primary" icon="info-sign">
              <strong>增殖细胞特征：</strong>
              <ul>
                <li>高表达细胞周期基因：TOP2A, MKI67, PCNA, CDK1, CCNB1</li>
                <li>缺乏其他特异性细胞类型marker</li>
                <li><strong>命名建议：</strong>"Proliferating cells" 或 "Cycling [细胞类型]"</li>
              </ul>
            </Callout>
          </div>

          <div className="workflow-step">
            <H5>
              <Tag intent="primary" large>步骤 5</Tag>
              <span className="step-title">AI辅助命名</span>
            </H5>
            <p><strong>当marker特异但不确定细胞类型时：</strong></p>
            <ol>
              <li>在TopMarker或DotPlot中筛选出特异性marker</li>
              <li>导出marker基因列表</li>
              <li>向AI模型提问（推荐使用DeepSeek、ChatGPT、Claude等）</li>
            </ol>

            <div className="ai-prompt-box">
              <Callout intent="primary" icon="lightbulb">
                <strong>推荐提示词：</strong>
                <div style={{ marginTop: "10px", padding: "10px", background: "#f5f5f5", borderRadius: "4px", fontFamily: "monospace" }}>
                  "这些基因特异性表达在某个细胞群中：[基因列表]。<br/>
                  这可能是什么细胞类型？请基于这些marker基因的已知功能进行推断。"
                </div>
              </Callout>
            </div>

            <p style={{ marginTop: "15px" }}><strong>验证AI建议：</strong></p>
            <ul>
              <li>查阅文献确认</li>
              <li>在CellMarker、PanglaoDB等数据库中验证</li>
              <li>检查AI提到的其他marker是否也在该群表达</li>
            </ul>
          </div>
        </Card>

        <Card elevation={Elevation.TWO} className="help-section">
          <H4>🎯 简化决策树</H4>

          <div className="decision-tree-simple">
            <Callout intent="primary" style={{ marginBottom: "15px" }}>
              <strong>起点：查看TopMarker页面的top差异基因</strong>
            </Callout>

            <div className="decision-flow">
              <div className="flow-step">
                <div className="flow-question">在DotPlot中检查marker特异性</div>
                <div className="flow-branches">
                  <div className="flow-branch">
                    <div className="flow-condition success">✓ 高特异性（1-2个群）</div>
                    <div className="flow-arrow">↓</div>
                    <div className="flow-action">搜索经典marker或AI辅助 → 命名</div>
                  </div>

                  <div className="flow-branch">
                    <div className="flow-condition warning">✗ 低特异性（多个群）</div>
                    <div className="flow-arrow">↓</div>
                    <div className="flow-question">检查VlnPlot的QC指标</div>
                    <div className="flow-sub-branches">
                      <div className="flow-sub-branch">
                        <div className="flow-condition danger">QC差</div>
                        <div className="flow-arrow">↓</div>
                        <div className="flow-result danger">标记"Low Quality"或排除</div>
                      </div>
                      <div className="flow-sub-branch">
                        <div className="flow-condition success">QC正常</div>
                        <div className="flow-arrow">↓</div>
                        <div className="flow-result primary">可能是Doublets或Proliferating cells</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Card>

        <Card elevation={Elevation.TWO} className="help-section">
          <H4>💬 欢迎加群交流反馈</H4>
          <div style={{ textAlign: "center", padding: "20px" }}>
            <p>遇到问题或有建议？欢迎加入微信群交流</p>
            <div style={{ marginTop: "20px" }}>
              <img
                src={wxqImageData}
                alt="微信群二维码"
                style={{ maxWidth: "200px", border: "1px solid #ddd", borderRadius: "8px" }}
              />
              <p style={{ marginTop: "10px", color: "#666", fontSize: "14px" }}>扫码加入微信群</p>
            </div>
          </div>
        </Card>

        <Card elevation={Elevation.TWO} className="help-section">
          <H4>🔔 欢迎关注获取更多新品</H4>
          <div style={{ textAlign: "center", padding: "20px" }}>
            <p>关注我们，获取更多生信工具和资源</p>
            <div style={{ marginTop: "20px" }}>
              <img
                src={seqyuanImageData}
                alt="关注二维码"
                style={{ maxWidth: "200px", border: "1px solid #ddd", borderRadius: "8px" }}
              />
              />
              <p style={{ marginTop: "10px", color: "#666", fontSize: "14px" }}>扫码关注</p>
            </div>
          </div>
        </Card>

        <Divider style={{ marginTop: "30px" }} />

        <div className="help-footer">
          <p style={{ textAlign: "center", color: "#666", fontSize: "14px" }}>
            AnnoCluster - 让单细胞注释更简单
          </p>
        </div>
      </div>
    </div>
  );
};

export default Help;
