import React from "react";
import { Card, Elevation, H3, H4, H5, Divider, Callout, Tag } from "@blueprintjs/core";
import "./Help.css";

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
            AnnoCluster 是一个专为生物学家设计的单细胞数据注释工具，无需编程即可完成细胞群的鉴定和命名。
            软件将复杂的编程工作抽象为可视化界面，让您专注于生物学解释。
          </p>
          <Callout intent="primary" icon="info-sign">
            <strong>核心理念：</strong>基于多重证据的系统化注释流程，而非单一marker的判断
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
              <li>评估细胞群的分离程度和空间关系</li>
              <li>识别可能的双细胞(doublets)或低质量细胞群</li>
            </ul>
            <Callout intent="none" icon="lightbulb">
              <strong>提示：</strong>分离良好的细胞群更可能代表真实的细胞类型
            </Callout>
          </div>

          <div className="workflow-step">
            <H5>
              <Tag intent="primary" large>步骤 2</Tag>
              <span className="step-title">经典Marker搜索 (DimPlot + 基因表达)</span>
            </H5>
            <ul>
              <li>搜索已知的细胞类型标志基因</li>
              <li>在降维图上叠加基因表达</li>
              <li>识别特异性表达某些marker的细胞群</li>
            </ul>
            <div className="example-box">
              <strong>示例：</strong>
              <ul>
                <li>T细胞: CD3D, CD3E, CD3G</li>
                <li>B细胞: CD79A, CD79B, MS4A1 (CD20)</li>
                <li>单核/巨噬细胞: CD14, CD68, LYZ</li>
                <li>NK细胞: NKG7, GNLY, KLRD1</li>
              </ul>
            </div>
          </div>

          <div className="workflow-step">
            <H5>
              <Tag intent="primary" large>步骤 3</Tag>
              <span className="step-title">Top Marker分析 (TopMarker)</span>
            </H5>
            <ul>
              <li>查看每个细胞群的top差异表达基因热图</li>
              <li>上传外部marker列表进行比对</li>
              <li>按表达特异性筛选marker</li>
            </ul>
            <Callout intent="warning" icon="warning-sign">
              <strong>注意：</strong>Top marker不一定都是好的细胞类型标志物，需要进一步验证特异性
            </Callout>
          </div>

          <div className="workflow-step">
            <H5>
              <Tag intent="primary" large>步骤 4</Tag>
              <span className="step-title">特异性评估 (DotPlot)</span>
            </H5>
            <p><strong>这是最关键的步骤！</strong></p>
            <ul>
              <li>在DotPlot中可视化marker在所有细胞群的表达</li>
              <li>评估marker的特异性：是否仅在目标细胞群高表达？</li>
              <li>根据特异性做出判断：</li>
            </ul>

            <div className="decision-tree">
              <Callout intent="success" icon="tick-circle">
                <strong>✓ 高特异性marker</strong>
                <ul>
                  <li>仅在1-2个细胞群高表达</li>
                  <li>其他细胞群表达很低或不表达</li>
                  <li>→ 可信度高，可用于细胞类型命名</li>
                </ul>
              </Callout>

              <Callout intent="warning" icon="warning-sign">
                <strong>⚠ 低特异性marker</strong>
                <ul>
                  <li>在多个细胞群都有表达</li>
                  <li>可能原因：</li>
                  <ul>
                    <li>低质量细胞群（核糖体/线粒体基因高表达）</li>
                    <li>双细胞（同时表达多种细胞类型marker）</li>
                    <li>增殖细胞（细胞周期基因在多种细胞类型中表达）</li>
                  </ul>
                  <li>→ 需要进一步检查（见步骤5和6）</li>
                </ul>
              </Callout>
            </div>
          </div>

          <div className="workflow-step">
            <H5>
              <Tag intent="primary" large>步骤 5</Tag>
              <span className="step-title">质控指标检查 (VlnPlot)</span>
            </H5>
            <p><strong>当Top marker特异性差时，必须检查QC指标！</strong></p>
            <ul>
              <li><code>nCount_RNA</code>: 每个细胞的总UMI数</li>
              <li><code>nFeature_RNA</code>: 每个细胞检测到的基因数</li>
              <li><code>percent.mt</code>: 线粒体基因占比</li>
            </ul>

            <div className="qc-guide">
              <Callout intent="danger" icon="error">
                <strong>低质量细胞群特征：</strong>
                <ul>
                  <li>nCount_RNA 明显低于其他群</li>
                  <li>nFeature_RNA 明显低于其他群</li>
                  <li>percent.mt 明显高于其他群（通常 &gt; 10-20%）</li>
                </ul>
                <strong>处理建议：</strong>标记为"Low Quality"或从下游分析中排除
              </Callout>

              <Callout intent="success" icon="tick">
                <strong>正常细胞群特征：</strong>
                <ul>
                  <li>QC指标与其他群相近</li>
                  <li>但top marker仍不特异</li>
                </ul>
                <strong>可能原因：</strong>增殖细胞群（见步骤6）或需要更深入的marker分析
              </Callout>
            </div>
          </div>

          <div className="workflow-step">
            <H5>
              <Tag intent="primary" large>步骤 6</Tag>
              <span className="step-title">增殖细胞识别</span>
            </H5>
            <p><strong>识别特征：</strong></p>
            <ul>
              <li>高表达细胞周期相关基因：
                <div className="gene-list">
                  <Tag>TOP2A</Tag>
                  <Tag>MKI67</Tag>
                  <Tag>PCNA</Tag>
                  <Tag>CDK1</Tag>
                  <Tag>CCNB1</Tag>
                  <Tag>CCNB2</Tag>
                  <Tag>CCNA2</Tag>
                </div>
              </li>
              <li>缺乏其他特异性细胞类型marker</li>
              <li>QC指标正常</li>
            </ul>
            <Callout intent="primary" icon="info-sign">
              <strong>命名建议：</strong>
              <ul>
                <li>如果无法确定细胞类型：命名为 "Proliferating cells"</li>
                <li>如果能确定细胞类型：命名为 "Cycling [细胞类型]"，例如 "Cycling T cells"</li>
              </ul>
            </Callout>
          </div>

          <div className="workflow-step">
            <H5>
              <Tag intent="primary" large>步骤 7</Tag>
              <span className="step-title">AI辅助注释</span>
            </H5>
            <p><strong>当marker特异但不确定细胞类型时：</strong></p>
            <ol>
              <li>在TopMarker或DotPlot中筛选出特异性marker</li>
              <li>导出marker基因列表</li>
              <li>向AI模型提问（DeepSeek、ChatGPT、Claude等）：
                <div className="ai-prompt-example">
                  <code>
                    "这些基因特异性表达在某个细胞群中：[基因列表]。<br/>
                    这可能是什么细胞类型？请基于这些marker基因的已知功能进行推断。"
                  </code>
                </div>
              </li>
              <li>验证AI的建议：
                <ul>
                  <li>查阅文献确认</li>
                  <li>在CellMarker、PanglaoDB等数据库中验证</li>
                  <li>检查AI提到的其他marker是否也在该群表达</li>
                </ul>
              </li>
              <li>确认后进行注释</li>
            </ol>
            <Callout intent="warning" icon="warning-sign">
              <strong>重要：</strong>AI的建议需要验证，不要盲目采纳。始终结合文献和数据库进行确认。
            </Callout>
          </div>

          <div className="workflow-step">
            <H5>
              <Tag intent="primary" large>步骤 8</Tag>
              <span className="step-title">最终注释与记录</span>
            </H5>
            <ul>
              <li>为每个细胞群分配生物学意义明确的名称</li>
              <li>记录注释依据（使用的marker、参考文献等）</li>
              <li>保存注释结果供下游分析使用</li>
            </ul>
          </div>
        </Card>

        <Card elevation={Elevation.TWO} className="help-section">
          <H4>🎯 常见场景与决策树</H4>

          <div className="scenario">
            <H5>场景A：Top marker高度特异</H5>
            <div className="decision-path">
              <div className="decision-node success">
                ✓ Marker仅在1-2个群表达
              </div>
              <div className="arrow">↓</div>
              <div className="decision-node">
                搜索文献/数据库确认细胞类型
              </div>
              <div className="arrow">↓</div>
              <div className="decision-node success">
                <strong>直接命名</strong>
              </div>
            </div>
          </div>

          <div className="scenario">
            <H5>场景B：Top marker不特异</H5>
            <div className="decision-path">
              <div className="decision-node warning">
                ⚠ Marker在多个群表达
              </div>
              <div className="arrow">↓</div>
              <div className="decision-node">
                检查VlnPlot中的QC指标
              </div>
              <div className="arrow-split">
                <div className="branch">
                  <div className="decision-node danger">
                    QC差（低count/feature，高mt%）
                  </div>
                  <div className="arrow">↓</div>
                  <div className="decision-result danger">
                    <strong>标记为"Low Quality"</strong>
                  </div>
                </div>
                <div className="branch">
                  <div className="decision-node success">
                    QC正常
                  </div>
                  <div className="arrow">↓</div>
                  <div className="decision-node">
                    检查增殖marker (TOP2A/MKI67)
                  </div>
                  <div className="arrow-split">
                    <div className="sub-branch">
                      <div className="decision-node primary">
                        高表达增殖marker
                      </div>
                      <div className="arrow">↓</div>
                      <div className="decision-result primary">
                        <strong>命名为"Proliferating cells"</strong>
                      </div>
                    </div>
                    <div className="sub-branch">
                      <div className="decision-node">
                        增殖marker正常
                      </div>
                      <div className="arrow">↓</div>
                      <div className="decision-result">
                        <strong>深入分析或AI辅助</strong>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="scenario">
            <H5>场景C：Marker特异但不认识</H5>
            <div className="decision-path">
              <div className="decision-node success">
                ✓ Marker特异性好
              </div>
              <div className="arrow">↓</div>
              <div className="decision-node warning">
                但不确定细胞类型
              </div>
              <div className="arrow">↓</div>
              <div className="decision-node primary">
                导出marker → AI查询
              </div>
              <div className="arrow">↓</div>
              <div className="decision-node">
                文献/数据库验证AI建议
              </div>
              <div className="arrow">↓</div>
              <div className="decision-node success">
                <strong>确认后命名</strong>
              </div>
            </div>
          </div>
        </Card>

        <Card elevation={Elevation.TWO} className="help-section">
          <H4>📚 参考资源</H4>
          <ul>
            <li>
              <strong>CellMarker 2.0:</strong>
              <a href="http://bio-bigdata.hrbmu.edu.cn/CellMarker/" target="_blank" rel="noopener noreferrer">
                http://bio-bigdata.hrbmu.edu.cn/CellMarker/
              </a>
              <span className="resource-desc"> - 细胞类型marker数据库</span>
            </li>
            <li>
              <strong>PanglaoDB:</strong>
              <a href="https://panglaodb.se/" target="_blank" rel="noopener noreferrer">
                https://panglaodb.se/
              </a>
              <span className="resource-desc"> - 单细胞marker基因数据库</span>
            </li>
            <li>
              <strong>Human Cell Atlas:</strong>
              <a href="https://www.humancellatlas.org/" target="_blank" rel="noopener noreferrer">
                https://www.humancellatlas.org/
              </a>
              <span className="resource-desc"> - 人类细胞图谱参考</span>
            </li>
            <li>
              <strong>OSCA Book:</strong>
              <a href="http://bioconductor.org/books/release/OSCA/" target="_blank" rel="noopener noreferrer">
                http://bioconductor.org/books/release/OSCA/
              </a>
              <span className="resource-desc"> - 单细胞分析最佳实践</span>
            </li>
          </ul>
        </Card>

        <Card elevation={Elevation.TWO} className="help-section">
          <H4>❓ 常见问题</H4>

          <div className="faq-item">
            <H5>Q: 一个细胞群可以有多个名称吗？</H5>
            <p>
              A: 可以。例如"CD4+ T cells"既可以叫"T cells"（粗略分类），也可以叫"CD4+ T cells"（精细分类）。
              根据研究目的选择合适的分辨率。
            </p>
          </div>

          <div className="faq-item">
            <H5>Q: 如果一个细胞群表达多种细胞类型的marker怎么办？</H5>
            <p>
              A: 这可能是双细胞(doublets)。检查QC指标，doublets通常有异常高的nCount和nFeature。
              建议标记为"Doublets"并在下游分析中排除。
            </p>
          </div>

          <div className="faq-item">
            <H5>Q: 所有细胞群都必须命名吗？</H5>
            <p>
              A: 不是。如果证据不足，可以标记为"Unknown"或"Unassigned"。
              强行命名可能导致错误的生物学解释。
            </p>
          </div>

          <div className="faq-item">
            <H5>Q: AI给出的细胞类型建议可靠吗？</H5>
            <p>
              A: AI是辅助工具，不能完全依赖。必须通过文献和数据库验证AI的建议。
              AI可能基于训练数据给出合理推测，但也可能出错。
            </p>
          </div>

          <div className="faq-item">
            <H5>Q: 如何处理稀有细胞类型？</H5>
            <p>
              A: 稀有细胞类型（如干细胞、祖细胞）的marker可能不在常见数据库中。
              需要查阅最新文献，或使用AI辅助结合领域专家知识进行判断。
            </p>
          </div>
        </Card>

        <Divider />

        <div className="help-footer">
          <Callout intent="primary" icon="help">
            <p>
              <strong>需要更多帮助？</strong>
            </p>
            <p>
              如有问题或建议，请访问我们的
              <a href="https://github.com/seqyuan/annocluster/issues" target="_blank" rel="noopener noreferrer">
                GitHub Issues
              </a>
            </p>
          </Callout>
        </div>
      </div>
    </div>
  );
};

export default Help;
